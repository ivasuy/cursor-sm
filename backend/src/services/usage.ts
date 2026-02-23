import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  pro: 500,
  enterprise: 5000,
};

export async function checkUsageQuota(uid: string): Promise<void> {
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    await userRef.set({
      plan: "free",
      usage: {
        summariesThisMonth: 0,
        lastReset: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    });
    return;
  }

  const data = userDoc.data()!;
  const plan = (data.plan as string) || "free";
  const usage = data.usage || { summariesThisMonth: 0, lastReset: "" };

  const lastReset = new Date(usage.lastReset || 0);
  const now = new Date();

  if (
    now.getMonth() !== lastReset.getMonth() ||
    now.getFullYear() !== lastReset.getFullYear()
  ) {
    await userRef.update({
      "usage.summariesThisMonth": 0,
      "usage.lastReset": now.toISOString(),
    });
    return;
  }

  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  if ((usage.summariesThisMonth as number) >= limit) {
    throw new Error(
      `Monthly limit reached (${limit} summaries on ${plan} plan). Upgrade for more.`
    );
  }
}

export async function incrementUsage(uid: string): Promise<void> {
  const db = getFirestore();
  await db.doc(`users/${uid}`).update({
    "usage.summariesThisMonth": FieldValue.increment(1),
    "usage.lastSummaryAt": new Date().toISOString(),
  });
}

export async function getUserPlan(
  uid: string
): Promise<{ plan: string; usage: number; limit: number }> {
  const db = getFirestore();
  const userDoc = await db.doc(`users/${uid}`).get();

  if (!userDoc.exists) {
    return { plan: "free", usage: 0, limit: PLAN_LIMITS.free };
  }

  const data = userDoc.data()!;
  const plan = (data.plan as string) || "free";
  const usage = (data.usage?.summariesThisMonth as number) || 0;
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  return { plan, usage, limit };
}
