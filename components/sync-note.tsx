"use client";

import { useState } from "react";

export function SyncNote({ slug, fieldId }: { slug: string; fieldId: string }) {
  const [message, setMessage] = useState("");
  async function queue(formData: FormData) {
    const payload = {
      slug,
      fieldId,
      kind: String(formData.get("kind") ?? "observation"),
      notes: String(formData.get("notes") ?? ""),
      completedOn: String(formData.get("completed") ?? ""),
      idempotencyKey: String(formData.get("idempotency") ?? crypto.randomUUID()),
    };
    const send = async () => {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("not saved");
      const body = (await response.json()) as { replayed?: boolean };
      setMessage(body.replayed ? "That note was already stored." : "Field note stored.");
      const raw = localStorage.getItem("fw-outbox");
      const queued = raw ? (JSON.parse(raw) as unknown[]) : [];
      localStorage.setItem("fw-outbox", JSON.stringify(queued.filter((item) => JSON.stringify(item) !== JSON.stringify(payload))));
    };
    try {
      await send();
    } catch {
      const raw = localStorage.getItem("fw-outbox");
      const queued = raw ? (JSON.parse(raw) as unknown[]) : [];
      queued.push(payload);
      localStorage.setItem("fw-outbox", JSON.stringify(queued));
      setMessage("Queued on this device. It will send when the connection returns.");
    }
  }
  return (
    <form action={queue} className="card grid gap-3">
      <h2 className="font-serif text-2xl">Field note</h2>
      <p className="text-sm">If the network drops, this note stays on the device and uses one idempotency key when it syncs.</p>
      <label className="field">Kind
        <select name="kind" defaultValue="observation">
          <option value="observation">Observation</option>
          <option value="irrigation">Irrigation</option>
          <option value="planting">Planting</option>
        </select>
      </label>
      <label className="field">Completed
        <input name="completed" type="date" required />
      </label>
      <label className="field">Notes
        <textarea name="notes" required />
      </label>
      <input name="idempotency" type="hidden" defaultValue="" />
      <button className="btn" type="submit">Save note</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
