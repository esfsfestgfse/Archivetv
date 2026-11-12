export function slotAt(schedule, now) {
  const index = schedule.slots.findIndex(slot => slot.startsAt <= now && now < slot.endsAt);
  if (index < 0) return null;
  const slot = schedule.slots[index];
  return { slot, offsetMs: now - slot.startsAt, next: schedule.slots[index + 1] || null };
}

export function retainPublishedSlots(previous, incoming) {
  const byStart = new Map(previous.map(slot => [slot.startsAt, slot]));
  return incoming.map(slot => {
    const old = byStart.get(slot.startsAt);
    return old?.id === slot.id && old.endsAt === slot.endsAt && old.url === slot.url &&
      old.kind === slot.kind && old.title === slot.title ? old : slot;
  });
}
