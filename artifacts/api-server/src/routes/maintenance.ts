
import {
  CreateAircraftBody,
  CreateAircraftResponse,
  CreateMaintenanceRecordBody,
  CreateMaintenanceRecordResponse,
  CreateMaintenanceTaskBody,
  CreateMaintenanceTaskResponse,
  GetActivityQueryParams,
  GetActivityResponse,
  GetDashboardSummaryResponse,
  GetAircraftResponse,
  ListAircraftResponse,
  ListMaintenanceRecordsQueryParams,
  ListMaintenanceRecordsResponse,
  ListMaintenanceTasksQueryParams,
  ListMaintenanceTasksResponse,
  ReviewMaintenanceRecordBody,
  ReviewMaintenanceRecordResponse,
  UpdateAircraftBody,
  UpdateAircraftResponse,
  UpdateMaintenanceTaskBody,
  UpdateMaintenanceTaskResponse,
} from "@workspace/api-zod";
import {
  activityTable,
  aircraftTable,
  db,
  maintenanceRecordsTable,
  maintenanceTasksTable,
} from "@workspace/db";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  return true;
}

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function taskStatus(task: {
  status: string;
  nextDueAt?: string | Date | null;
  nextDueHours?: number | null;
  nextDueCycles?: number | null;
}) {
  if (task.status === "completed") return "completed";
  
  if (task.nextDueAt) {
    const dueTime = new Date(task.nextDueAt).getTime();
    const now = Date.now();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    
    if (dueTime < now) return "overdue";
    if (dueTime - now <= sevenDaysInMs) return "due_soon";
  }
  
  return task.status;
}

router.get("/dashboard/summary", async (_req, res) => {
  const [aircraft, tasks, records] = await Promise.all([
    db.select().from(aircraftTable),
    db.select().from(maintenanceTasksTable),
    db.select().from(maintenanceRecordsTable),
  ]);

  res.json(
    GetDashboardSummaryResponse.parse({
      aircraftCount: aircraft.length,
      overdueCount: tasks.filter((task) => taskStatus(task) === "overdue").length,
      dueSoonCount: tasks.filter((task) => taskStatus(task) === "due_soon").length,
      pendingRecordsCount: records.filter((record) => record.reviewStatus === "pending").length,
      openTaskCount: tasks.filter((task) => taskStatus(task) !== "completed").length,
      utilisationHours: aircraft.reduce((sum, item) => sum + (item.totalHours ?? 0), 0),
    }),
  );
});

router.get("/activity", async (req, res) => {
  const parsed = GetActivityQueryParams.safeParse(req.query);
  const limit = parsed.success ? parsed.data.limit ?? 10 : 10;
  const rows = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(limit);

  res.json(
    GetActivityResponse.parse(
      rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        detail: row.detail,
        createdAt: row.createdAt.toISOString(),
      })),
    ),
  );
});

router.get("/aircraft", async (_req, res) => {
  const rows = await db.select().from(aircraftTable).orderBy(aircraftTable.registration);
  res.json(
    ListAircraftResponse.parse(
      rows.map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
    ),
  );
});

router.post("/aircraft", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const parsed = CreateAircraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid aircraft details" });
    return;
  }
  const [row] = await db
    .insert(aircraftTable)
    .values({
      registration: parsed.data.registration,
      aircraftType: parsed.data.aircraftType,
      serialNumber: parsed.data.serialNumber,
      operator: parsed.data.operator,
      totalHours: parsed.data.totalHours ?? 0,
      totalCycles: parsed.data.totalCycles ?? 0,
    })
    .returning();

  await db.insert(activityTable).values({
    kind: "aircraft_updated",
    title: "Aircraft added",
    detail: `${row.registration} was added to the fleet`,
  });

  res.status(201).json(
    CreateAircraftResponse.parse({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
});

router.get("/aircraft/:aircraftId", async (req, res) => {
  const [row] = await db
    .select()
    .from(aircraftTable)
    .where(eq(aircraftTable.id, Number(req.params.aircraftId)));

  if (!row) {
    res.status(404).json({ error: "Aircraft not found" });
    return;
  }

  res.json(
    GetAircraftResponse.parse({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
});

router.patch("/aircraft/:aircraftId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.aircraftId);
  const params = UpdateAircraftBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: "Invalid aircraft update" });
    return;
  }

  const [row] = await db
    .update(aircraftTable)
    .set({
      ...params.data,
      updatedAt: new Date(),
    })
    .where(eq(aircraftTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Aircraft not found" });
    return;
  }

  await db.insert(activityTable).values({
    kind: "aircraft_updated",
    title: "Aircraft utilisation updated",
    detail: `${row.registration} now has ${row.totalHours} hours and ${row.totalCycles} cycles`,
  });

  res.json(
    UpdateAircraftResponse.parse({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
});

router.get("/tasks", async (req, res) => {
  const parsed = ListMaintenanceTasksQueryParams.safeParse(req.query);
  const filters = parsed.success ? parsed.data : {};
  const conditions = [];

  if (filters.aircraftId !== undefined) conditions.push(eq(maintenanceTasksTable.aircraftId, filters.aircraftId));
  if (filters.status) conditions.push(eq(maintenanceTasksTable.status, filters.status));
  if (filters.search) {
    conditions.push(
      or(
        ilike(maintenanceTasksTable.title, `%${filters.search}%`),
        ilike(maintenanceTasksTable.taskNumber, `%${filters.search}%`),
      ),
    );
  }

  const rows = await db
    .select({
      task: maintenanceTasksTable,
      registration: aircraftTable.registration,
    })
    .from(maintenanceTasksTable)
    .innerJoin(aircraftTable, eq(maintenanceTasksTable.aircraftId, aircraftTable.id))
    .where(conditions.length ? and(...conditions) : undefined);

  res.json(
    ListMaintenanceTasksResponse.parse(
      rows.map(({ task, registration }) => ({
        ...task,
        aircraftRegistration: registration,
        status: taskStatus(task),
      })),
    ),
  );
});

router.post("/tasks", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const parsed = CreateMaintenanceTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid maintenance task details" });
    return;
  }

  const [row] = await db
    .insert(maintenanceTasksTable)
    .values({
      ...parsed.data,
      lastAccomplishedAt: asIso(parsed.data.lastAccomplishedAt),
      nextDueAt: asIso(parsed.data.nextDueAt),
    })
    .returning();

  const [aircraft] = await db
    .select({ registration: aircraftTable.registration })
    .from(aircraftTable)
    .where(eq(aircraftTable.id, row.aircraftId));

  await db.insert(activityTable).values({
    kind: "task_updated",
    title: "Maintenance task added",
    detail: `${row.taskNumber} was added for ${aircraft?.registration ?? "aircraft"}`,
  });

  res.status(201).json(
    CreateMaintenanceTaskResponse.parse({
      ...row,
      aircraftRegistration: aircraft?.registration ?? "Unknown",
    }),
  );
});

router.patch("/tasks/:taskId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { taskId } = req.params;
  const parsed = UpdateMaintenanceTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid maintenance task update" });
    return;
  }

  const [row] = await db
    .update(maintenanceTasksTable)
    .set({
      ...parsed.data,
      lastAccomplishedAt: asIso(parsed.data.lastAccomplishedAt),
      nextDueAt: asIso(parsed.data.nextDueAt),
    })
    .where(eq(maintenanceTasksTable.id, Number(taskId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Maintenance task not found" });
    return;
  }

  const [aircraft] = await db
    .select({ registration: aircraftTable.registration })
    .from(aircraftTable)
    .where(eq(aircraftTable.id, row.aircraftId));

  await db.insert(activityTable).values({
    kind: "task_updated",
    title: "Maintenance task updated",
    detail: `${row.taskNumber} was updated`,
  });

  res.json(
    UpdateMaintenanceTaskResponse.parse({
      ...row,
      aircraftRegistration: aircraft?.registration ?? "Unknown",
    }),
  );
});

router.get("/records", async (req, res) => {
  const parsed = ListMaintenanceRecordsQueryParams.safeParse(req.query);
  const filters = parsed.success ? parsed.data : {};
  const conditions = [];

  if (filters.aircraftId !== undefined) conditions.push(eq(maintenanceRecordsTable.aircraftId, filters.aircraftId));
  if (filters.reviewStatus) conditions.push(eq(maintenanceRecordsTable.reviewStatus, filters.reviewStatus));
  if (filters.search) {
    conditions.push(
      or(
        ilike(maintenanceRecordsTable.documentName, `%${filters.search}%`),
        ilike(maintenanceRecordsTable.airline, `%${filters.search}%`),
      ),
    );
  }

  const rows = await db
    .select({
      record: maintenanceRecordsTable,
      registration: aircraftTable.registration,
    })
    .from(maintenanceRecordsTable)
    .innerJoin(aircraftTable, eq(maintenanceRecordsTable.aircraftId, aircraftTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(maintenanceRecordsTable.uploadedAt));

  res.json(
    ListMaintenanceRecordsResponse.parse(
      rows.map(({ record, registration }) => ({
        ...record,
        aircraftRegistration: registration,
        objectPath: record.objectPath ?? null,
        description: record.description ?? null,
        uploadedAt: record.uploadedAt.toISOString(),
        reviewedAt: asIso(record.reviewedAt),
      })),
    ),
  );
});

router.post("/records", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const parsed = CreateMaintenanceRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid maintenance record details" });
    return;
  }

  const user = req.user as { email?: string; id?: string } | undefined;
  const uploader = user?.email ?? user?.id ?? "Unknown System User";

  const [row] = await db
    .insert(maintenanceRecordsTable)
    .values({
      ...parsed.data,
      uploadedBy: uploader,
    })
    .returning();

  const [aircraft] = await db
    .select({ registration: aircraftTable.registration })
    .from(aircraftTable)
    .where(eq(aircraftTable.id, row.aircraftId));

  await db.insert(activityTable).values({
    kind: "record_uploaded",
    title: "Maintenance record received",
    detail: `${row.documentName} from ${row.airline} is awaiting review`,
  });

  res.status(201).json(
    CreateMaintenanceRecordResponse.parse({
      ...row,
      aircraftRegistration: aircraft?.registration ?? "Unknown",
      objectPath: row.objectPath ?? null,
      description: row.description ?? null,
      uploadedAt: row.uploadedAt.toISOString(),
      reviewedAt: null,
    }),
  );
});

router.patch("/records/:recordId/review", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const parsed = ReviewMaintenanceRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid review status" });
    return;
  }

  const [row] = await db
    .update(maintenanceRecordsTable)
    .set({
      reviewStatus: parsed.data.reviewStatus,
      reviewedAt: new Date(),
    })
    .where(eq(maintenanceRecordsTable.id, Number(req.params.recordId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Maintenance record not found" });
    return;
  }

  const [aircraft] = await db
    .select({ registration: aircraftTable.registration })
    .from(aircraftTable)
    .where(eq(aircraftTable.id, row.aircraftId));

  await db.insert(activityTable).values({
    kind: "record_reviewed",
    title: "Record review completed",
    detail: `${row.documentName} marked ${row.reviewStatus}`,
  });

  res.json(
    ReviewMaintenanceRecordResponse.parse({
      ...row,
      aircraftRegistration: aircraft?.registration ?? "Unknown",
      objectPath: row.objectPath ?? null,
      description: row.description ?? null,
      uploadedAt: row.uploadedAt.toISOString(),
      reviewedAt: asIso(row.reviewedAt),
    }),
  );
});

export default router;