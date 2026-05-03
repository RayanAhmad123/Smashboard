// Customer-side booking storage. The /play page is unauthenticated, so we
// remember a customer's registrations in localStorage on the device they
// booked from. This lets them return and manage (view/cancel) bookings
// without a login.

export type StoredBooking = {
  id: string;
  tournamentId: string;
  createdAt: string;
};

function key(tenantSlug: string): string {
  return `smashboard:bookings:${tenantSlug}`;
}

export function loadBookings(tenantSlug: string): StoredBooking[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(tenantSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b): b is StoredBooking =>
        !!b &&
        typeof b === "object" &&
        typeof (b as StoredBooking).id === "string" &&
        typeof (b as StoredBooking).tournamentId === "string"
    );
  } catch {
    return [];
  }
}

export function saveBooking(tenantSlug: string, booking: StoredBooking): void {
  if (typeof window === "undefined") return;
  const existing = loadBookings(tenantSlug).filter((b) => b.id !== booking.id);
  existing.push(booking);
  window.localStorage.setItem(key(tenantSlug), JSON.stringify(existing));
}

export function removeBooking(tenantSlug: string, bookingId: string): void {
  if (typeof window === "undefined") return;
  const remaining = loadBookings(tenantSlug).filter((b) => b.id !== bookingId);
  window.localStorage.setItem(key(tenantSlug), JSON.stringify(remaining));
}
