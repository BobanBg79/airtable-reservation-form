# Brief: Reservations entity

Final version, approved by the owner. This is the instruction for Claude Code, and later goes into an ADR and `CLAUDE.md`. Cleaning and payments are out of scope for this brief.

## 1. One table, three types

One `reservations` table. Every row books one apartment for a date range. The `type` column says what kind:

- `guest`: a real guest stay.
- `inquiry`: dates held while a guest decides.
- `block`: dates closed for a non-guest reason (repainting, closing the night before an early 8:00 arrival, and so on).

The dates always live on the row. There is no separate occupancy table.

## 2. Statuses per type

| Type | Statuses | Blocks the calendar |
| --- | --- | --- |
| guest | active, canceled, noshow | only active |
| inquiry | active, expired, inactive | only active |
| block | active, inactive | only active |

Rules:

- Only `active` occupies the calendar. Every other status frees the dates.
- Non-active statuses are final. Nothing goes back to `active`. To restore, create a new reservation.
- A row in a final status is read-only.
- An `active` row can change its dates and its apartment, subject to the overlap check.
- `noshow` can be set only once the check-in day has arrived.
- A stay that is over stays `active`. There is no `completed` status.
- Nothing is ever deleted (soft-delete rule, ADR 0003).

Final states, with no edits of any field: guest `canceled` and `noshow`; inquiry `expired` and `inactive`; block `inactive`. The edit endpoints reject any change to such a row. Two things are not edits of the row and stay possible: adding payments to a canceled or no-show reservation, and an inquiry counting as expired by time before its status is written.

## 3. Converting an inquiry

Confirming an inquiry converts the same row: `type` becomes `guest`, `status` stays `active`, `expires_at` is cleared by the server (the only time it changes) and `converted_at` is set, all in one edit. The guest fields become required at that moment. The dates are never released in between.

Inquiries expire after 24 hours by default and are never extended; once expired, a new inquiry is created (`expires_at = created_at + 24h`). Expiry is decided by time alone: an active inquiry whose `expires_at` has passed counts as expired everywhere (overlap check, calendar, conversion), whatever its stored status. A periodic job also writes `expired` into such rows, for tidy data and reports, but nothing depends on it running on time.

Edge cases:

- An inquiry can be converted only while its `expires_at` is still in the future.
- Editing an active inquiry's dates or apartment does not reset `expires_at`. `expires_at` is set once at creation and can never be edited by anyone.
- A no-show frees every night of the reservation. A guest who arrives late is not a no-show: edit the check-in date instead.

Inquiry to guest is the only allowed type change. A guest reservation never becomes an inquiry or a block, and a block never changes type.

## 4. Fields

Always required: `id`, `apartment_id`, `check_in` (date), `check_out` (date), `type`, `status`, `created_by`, `created_at`, `updated_at`.

Required by type:

- guest: `booking_agent_id`, `total_amount`, `phone`.
- inquiry: `expires_at`.
- block: `reason` (free text).

Optional: `guest_first_name`, `guest_last_name` (text), `guest_id`, `price_per_night`, `arrival_time`, `departure_time`, `notes` (max 255 characters), `converted_at`.

Check constraints enforce the per-type required fields. `expires_at` is set only for `inquiry`, and empty for every other type.

## 5. Dates

- `check_in` and `check_out` are plain dates, with no time zone.
- The stay is a half-open range: it includes check-in and excludes check-out. A check-out day can be the next guest's check-in day.
- The 14:00 check-in is a house rule for display only, not part of the overlap logic.
- `arrival_time` and `departure_time` are optional and are used for cleaning and organisation.
- Check-out must be after check-in (minimum one night), enforced by a check constraint. Dates in the past are allowed, for example when moving data over from the Google Sheet.

## 6. Overlap

Overlaps are enforced in the database by a trigger on insert and update, not by an exclusion constraint, because a constraint cannot read the current time. The check runs on every create of a blocking row, and on every edit that changes the dates or the apartment of a row that stays blocking. A status change into a final status (canceled, noshow, expired, inactive) never runs the overlap check and can never be rejected because of other rows' dates. The trigger rejects the row if its `daterange(check_in, check_out, '[)')` overlaps any other row of the same apartment that is `active` and is not an inquiry past its `expires_at`. It covers guest, inquiry and block together. The trigger takes a per-apartment lock (advisory lock on `apartment_id`), so two concurrent saves cannot both pass. When an edit moves a reservation to another apartment, both apartments are locked, always in ascending id order, to avoid deadlocks. The conflict raises SQLSTATE `23P01`, mapped to HTTP 409 "Occupied". `findConflict` in `packages/core` stays as the client pre-check and must use the same rule.

One blocking rule, defined once: a SQL function (for example `reservation_blocks_calendar(row)`) says whether a row occupies the calendar. Both the overlap trigger and `GET /api/calendar` use that same function, with the database clock (`now()`), never the device clock. So what the calendar shows as free is exactly what the save accepts. The client pre-check in `packages/core` mirrors the rule, and a parity test keeps the two equal (like the existing `ADMIN_ONLY_PERMISSIONS` parity test).

## 7. Booking agent

`booking_agent_id` is required on guest reservations. Direct bookings use an explicit "Direct" agent row, seeded by the migration and protected from deactivation, the same way as the fixed admin role.

The `booking_agents` table does not exist yet and is created in this work: `id`, `name` (required, unique), `is_active`, `notes` (optional free text, max 255 characters), `created_by`, `created_at`, `updated_at`. The migration seeds the four current agents: Direct, Airbnb, Booking and Beo apartman. The app also needs a list and a create/edit form for booking agents, on the shared `FormVM`.

A deactivated apartment or booking agent cannot be picked for a new reservation, but still shows on existing ones. In the dropdowns, inactive apartments and agents are listed at the bottom, disabled.

Booking agent permissions: `can_view_booking_agent` for everyone (the reservation form needs the list); `can_create_booking_agent` and `can_edit_booking_agent` for business_owner only.

## 8. Money

- `numeric(10,2)`, never float. A helper in `packages/core` converts the driver's string into a number.
- `total_amount` is the source of truth.
- `price_per_night` accepts at most 2 decimals.
- In the form, either field can be edited and the other follows. That logic lives in `FormVM`, never in a view. Save stores both values; when they disagree after rounding, the total wins.
- No silent rewriting of the total on the server.

## 9. Phone

Stored in international format: `+`, then the country code, then the number (for example `+381641234567`). Any country is accepted, because many guests are foreign. There is no automatic conversion of local numbers: the phone must be entered in full international format, starting with `+`. Required on guest reservations, optional on inquiries.

## 10. Guests

- The reservation is primary. It always saves with `phone`, `guest_first_name` and `guest_last_name`, and needs no guest record.
- `guests.phone` is unique. The guest has a normal `id` as primary key.
- Save order: the reservation commits first. Only then is a guest created for an unknown phone (insert, doing nothing on conflict). If that step fails, it is logged and the reservation stays. If the reservation fails, no guest is created. No backfill script.
- An existing guest's name is never overwritten. Each reservation keeps its own `guest_first_name` and `guest_last_name`. The form can hint "this number is known as Marko".
- A flagged (bad) guest triggers a warning only, never a hard stop. The first save returns "flagged, confirm". The form shows the warning, and the save is resent with a confirmed flag, or abandoned.

Inquiries: the flagged-guest warning applies to inquiries too (when a phone is given), but an inquiry never creates a guest record. The guest is created only when the row becomes a guest reservation, at conversion.

Changing the phone on an existing reservation runs the same steps again: the flagged-guest warning is checked for the new number, and on a guest reservation an unknown new number creates a guest record, only after the edit has saved successfully.

### Guests table

A new `guests` table:

| Field | Type | Rule |
| --- | --- | --- |
| `id` | primary key | |
| `phone` | text | required, unique, international format |
| `first_name` | text | optional, taken from the first reservation, never overwritten |
| `last_name` | text | optional, same as `first_name` |
| `flagged` | boolean | default false; a flagged guest triggers the warning |
| `flag_reason` | text | free text, shown in the warning |
| `flagged_at`, `flagged_by` | timestamp, user | set when flagged |
| `notes` | text | optional, max 255 characters |
| `is_active` | boolean | soft delete |
| `created_by`, `created_at`, `updated_at` | user, timestamps | audit |

Guest permissions (`can_view_guest`, `can_create_guest`, `can_edit_guest`, including flagging): business_owner and manager.

## 11. Permissions

| Permission | Covers | Roles |
| --- | --- | --- |
| `can_view_reservation` | calendar and all types (non-sensitive fields) | everyone |
| `can_view_reservation_sensitive` | sensitive fields (prices, totals, phone; notes and guest name stay visible to everyone) | business_owner, manager |
| `can_create_guest_reservation`, `can_edit_guest_reservation` | guest reservations | business_owner |
| `can_create_inquiry`, `can_edit_inquiry` | inquiries | manager, business_owner |
| `can_create_block`, `can_edit_block` | blocks | manager, business_owner |

Seeing the calendar always means seeing reservations, so `can_view_reservation` gates both. Sensitive fields are a field-level permission: the API leaves them out of the response for anyone without `can_view_reservation_sensitive`. Cleaning staff, for example, see dates, apartment and arrival and departure times, but never the price or the phone.

All new permissions (reservation, guest and booking agent) are inserted and granted in the same migration, to the roles listed above, and to admin. Further changes are made by the admin through the Manage roles screen, not in code.

Converting an inquiry into a guest reservation requires `can_edit_guest_reservation`. Payments on reservations are a payment permission, out of scope here.

## 12. API

Separate create and edit routes per entity (owner rule). Cancel is an edit. The calendar API must return the reservation id (known issue 11). Overlap and validation rules in `packages/core` must be shared with `api/` (known issue 12b).

### Security and validation

**The backend is the only real gate.** Every permission, field rule, transition and overlap check in this brief is enforced in `api/` or in the database. The app may hide buttons, fields or options for convenience, but no rule may exist only on the client, and the API must give the same answer whether the request comes from the app or from a direct HTTP call. Every new route gets a test that calls it without the needed permission and expects 403.

- **Server-set fields.** `created_by`, `created_at`, `updated_at`, `expires_at` and `converted_at` are always set by the server. Values sent by the client are ignored.
- **Allow-list per type.** Each create and edit route accepts only the fields allowed for that type, and rejects anything else (no mass assignment).
- **Permissions by old and new type.** An edit checks the permission for the row's current type, and a conversion also needs `can_edit_guest_reservation`. A manager with `can_edit_inquiry` can never turn an inquiry into a guest reservation, or touch a guest row, by sending a different `type`.
- **Transitions on the server.** Only the transitions in sections 2 and 3 are accepted. Any edit of a final row is rejected, and so is any edit of an inquiry past its `expires_at`, even if its stored status still says `active`.
- **Sensitive fields on every endpoint.** Prices, totals and phone are stripped on the server for users without `can_view_reservation_sensitive`, in every response that returns reservations (calendar, details, and the future list), never only hidden in the UI.
- **Guest data in warnings.** The flagged-guest warning, its reason, and the "known as Marko" hint are returned only to users with `can_view_guest`.
- **One clock and one day.** Expiry uses the database clock. "Today" (for example when no-show becomes allowed) is the date in Europe/Belgrade, computed on the server.
- **Protected Direct agent.** The server refuses to deactivate or rename the Direct booking agent.

## 13. Still open

- Payments on canceled and no-show reservations (for example a no-show fee) must stay possible. To be designed with payments.

## 14. Later (add to TODO.md)

- Voice reservation: create a reservation from speech, with a preview before saving (as in the old MERN app).
- Reservation list: paginated, with filters and sorting, to find reservations quickly. Reports are a separate topic.

## 15. Instructions for Claude Code

1. Implement everything in this brief: migrations (tables, check constraints, the blocking-rule function, the overlap trigger, permissions and their grants, the booking agent seed), API routes, `packages/core` rules with parity tests, and the forms on `FormVM`.
2. Follow the owner's working rules in `CLAUDE.md`: separate create and edit routes, tests import the real function and use literal expectations, form behaviour only in `FormVM`, everything in English, push to `main` only on the owner's OK.
3. Write detailed documentation of all of this, including every rule above (types, statuses, final states and their exceptions, conversion, expiry, the blocking rule, overlaps, guests and the warning, booking agents, money, phone, permissions):
   - a new ADR for the reservations model (one table, three types, statuses, final states, expiry by time, the overlap trigger);
   - update ADR 0007 (access model) with the new permissions, and ADR 0008's route table with the new routes;
   - update `CLAUDE.md`, `docs/database-migrations.md`, `TODO.md` (including section 14) and `KNOWN_ISSUES.md` (close issues 11 and 12b when fixed);
   - a report in `docs/reports` when the work is done.
