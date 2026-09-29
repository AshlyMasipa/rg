import type {
  SolveInput,
  SolveResult,
  TraceItem,
  BundleCandidate,
  BindingConstraint,
  EquipmentKit,
  TransportOffer,
  Day,
} from './types';

const EARTH_RADIUS_KM = 6371;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function coversWindow(
  windows: { day: Day; start: string; end: string }[],
  day: Day,
  start: string,
  end: string
): boolean {
  const needStart = timeToMinutes(start);
  const needEnd = timeToMinutes(end);
  return windows.some(
    (w) => w.day === day && timeToMinutes(w.start) <= needStart && timeToMinutes(w.end) >= needEnd
  );
}

function overlaps(
  windows: { day: Day; start: string; end: string }[],
  day: Day,
  start: string,
  end: string
): boolean {
  const needStart = timeToMinutes(start);
  const needEnd = timeToMinutes(end);
  return windows.some(
    (w) => w.day === day && timeToMinutes(w.start) < needEnd && timeToMinutes(w.end) > needStart
  );
}

// MULTI-DAY: a field/coach/transport must satisfy EVERY day the need runs on,
// not just one. A single missing day fails the whole candidate.
function coversAllDays(
  windows: { day: Day; start: string; end: string }[],
  days: Day[],
  start: string,
  end: string
): boolean {
  return days.every((day) => coversWindow(windows, day, start, end));
}

function overlapsAllDays(
  windows: { day: Day; start: string; end: string }[],
  days: Day[],
  start: string,
  end: string
): boolean {
  return days.every((day) => overlaps(windows, day, start, end));
}

export function solve(input: SolveInput): SolveResult {
  const { need, world, policy } = input;
  const trace: TraceItem[] = [];
  let step = 0;
  const failCounts = new Map<string, { count: number; message: string }>();

  const pushTrace = (check: string, subject: string, status: 'pass' | 'fail', message: string) => {
    step += 1;
    trace.push({ step, check, subject, status, message });
    if (status === 'fail') {
      const existing = failCounts.get(check);
      failCounts.set(check, { count: (existing?.count ?? 0) + 1, message });
    }
  };

  const days = need.days;
  const dayLabel = days.join('+');
  const school = world.schools.find((s) => s.id === need.school_id);
  const candidates: BundleCandidate[] = [];

  for (const field of world.fields) {
    if (!coversAllDays(field.availability, days, need.start_time, need.end_time)) {
      pushTrace('time', field.id, 'fail', `${field.name} not available all of ${dayLabel} ${need.start_time}-${need.end_time}`);
      continue;
    }
    if (field.capacity < need.participants) {
      pushTrace('capacity', field.id, 'fail', `${field.name} capacity ${field.capacity} < ${need.participants}`);
      continue;
    }
    pushTrace('time', field.id, 'pass', `${field.name} free ${dayLabel} ${need.start_time}-${need.end_time}`);
    pushTrace('capacity', field.id, 'pass', `${field.name} capacity ${field.capacity} covers ${need.participants}`);

    const schoolFieldKm = school ? haversineKm(school.lat, school.lng, field.lat, field.lng) : null;

    for (const coach of world.coaches) {
      if (!overlapsAllDays(coach.availability, days, need.start_time, need.end_time)) {
        pushTrace('time', coach.id, 'fail', `Coach ${coach.name} not free all of ${dayLabel} ${need.start_time}-${need.end_time}`);
        continue;
      }
      if (!coach.credentials.includes(need.age_group)) {
        pushTrace('age-group', coach.id, 'fail', `Coach ${coach.name} lacks ${need.age_group} credential`);
        continue;
      }
      if (!coach.credentials.includes('safeguarding')) {
        pushTrace('safeguarding', coach.id, 'fail', `Coach ${coach.name} has no safeguarding certificate`);
        continue;
      }
      pushTrace('age-group', coach.id, 'pass', `Coach ${coach.name} is ${need.age_group}-qualified`);
      pushTrace('safeguarding', coach.id, 'pass', `Coach ${coach.name} is safeguarding-certified`);

      const coachFieldKm = haversineKm(coach.home_lat, coach.home_lng, field.lat, field.lng);
      const withinTravel = coachFieldKm <= coach.max_travel_km;

      const doubleBooked = world.bookings.some((b) => {
        if (!b.field_id && !b.coach_id) return false;
        if (!b.start_time || !b.end_time) return false;
        const bDays = b.days ?? [];
        const anySharedDayOverlap = days.some(
          (day) => bDays.includes(day) && overlaps([{ day, start: b.start_time!, end: b.end_time! }], day, need.start_time, need.end_time)
        );
        return anySharedDayOverlap && (b.field_id === field.id || b.coach_id === coach.id);
      });
      if (doubleBooked) {
        pushTrace('double-booking', `${field.id}+${coach.id}`, 'fail', `${field.name} or Coach ${coach.name} already booked one of ${dayLabel} that slot`);
        continue;
      }

      // balls:0 means no ball requirement at all -> skip kit matching entirely,
      // kit_id stays null. This is already correct; test locks it in.
      const kitOptions: (EquipmentKit | null)[] =
        need.needs.balls > 0
          ? world.kits.filter((k) => k.available && k.ball_count >= need.needs.balls)
          : [null];
      if (kitOptions.length === 0) {
        pushTrace('balls', 'kits', 'fail', `No kit has ${need.needs.balls}+ balls available`);
        continue;
      }

      const needsTransport = !withinTravel;
      const transportOptions: (TransportOffer | null)[] = needsTransport
        ? world.transport.filter(
            (t) => t.seats >= need.participants && coversAllDays(t.availability, days, need.start_time, need.end_time)
          )
        : [null, ...world.transport.filter((t) => t.seats >= need.participants)];

      if (needsTransport && transportOptions.length === 0) {
        pushTrace('travel', coach.id, 'fail', `Coach ${coach.name} is ${coachFieldKm.toFixed(1)}km away (limit ${coach.max_travel_km}km), no transport covers all of ${dayLabel}`);
        continue;
      }
      pushTrace(
        'travel',
        coach.id,
        'pass',
        needsTransport
          ? `Transport arranged covers Coach ${coach.name}'s ${coachFieldKm.toFixed(1)}km commute`
          : `Coach ${coach.name} is ${coachFieldKm.toFixed(1)}km away, within ${coach.max_travel_km}km`
      );

      for (const kit of kitOptions) {
        for (const transport of transportOptions) {
          for (const sponsor of world.sponsors) {
            // MULTI-DAY ASSUMPTION: one session per day per week, so a
            // 2-day need costs 2x a 1-day need at the same field/coach.
            // Flagged in NOTES.md as an assumption, not a confirmed contract rule.
            const sessionsPerWeek = days.length;
            const weeklyCost =
              (field.cost_per_session + coach.cost_per_session) * sessionsPerWeek +
              (transport ? transport.cost_per_trip * sessionsPerWeek : 0);
            const totalCost = weeklyCost * need.weeks;
            if (totalCost > sponsor.remaining) {
              pushTrace('cost', sponsor.id, 'fail', `Total cost R${totalCost} exceeds ${sponsor.sponsor} remaining R${sponsor.remaining}`);
              continue;
            }
            pushTrace('cost', sponsor.id, 'pass', `Total cost R${totalCost} within ${sponsor.sponsor} remaining R${sponsor.remaining}`);

            const travelScore = withinTravel
              ? policy.weights.travel * Math.max(0, 1 - coachFieldKm / coach.max_travel_km)
              : policy.weights.travel * 0.5;
            const utilization = need.participants / field.capacity;
            const capacityScore = policy.weights.capacity * Math.min(1, utilization + 0.3);
            const priorityMatch = sponsor.priorities.includes('female-participation') && need.gender === 'girls';
            const priorityScore = priorityMatch ? policy.weights.priority : policy.weights.priority * 0.4;
            const budgetFraction = totalCost / sponsor.remaining;
            const costScore = policy.weights.cost * Math.max(0, 1 - budgetFraction);
            const score = Math.round(travelScore + capacityScore + priorityScore + costScore);

            const explanation: string[] = [
              `${field.name} is ${schoolFieldKm?.toFixed(1) ?? '?'} km from the school and free ${dayLabel}`,
              `Coach ${coach.name} is ${need.age_group}-qualified, safeguarding-certified and free ${dayLabel}`,
              kit ? `${kit.description} has ${kit.ball_count} balls (${need.needs.balls} needed)` : `No balls needed for this session`,
              `${sponsor.sponsor}${priorityMatch ? ' prioritises female participation; ' : '; '}${need.weeks} weeks costs R${totalCost} of R${sponsor.remaining}`,
            ];

            candidates.push({
              rank: 0,
              field_id: field.id,
              coach_id: coach.id,
              kit_id: kit?.id ?? null,
              transport_id: transport?.id ?? null,
              sponsor_id: sponsor.id,
              weekly_cost: weeklyCost,
              score,
              score_breakdown: {
                travel: Math.round(travelScore),
                capacity: Math.round(capacityScore),
                priority: Math.round(priorityScore),
                cost: Math.round(costScore),
              },
              explanation,
            });
          }
        }
      }
    }
  }

  if (candidates.length === 0) {
    let topCheck: { check: string; message: string } | null = null;
    let topCount = 0;
    for (const [check, data] of failCounts) {
      if (data.count > topCount) {
        topCount = data.count;
        topCheck = { check, message: data.message };
      }
    }
    const binding: BindingConstraint = topCheck
      ? { check: topCheck.check, message: topCheck.message, sponsor_request: `Fund a fix for: ${topCheck.message}` }
      : { check: 'unknown', message: 'No feasible bundle found', sponsor_request: 'Review need against available resources' };

    return { feasible: false, bundles: [], binding_constraint: binding, trace };
  }

  // TIE-BREAKING: score desc is the primary sort, but ties need a
  // deterministic secondary order so demo re-runs and tests are stable —
  // otherwise stable-sort insertion order (field/coach loop order) decides,
  // which is an accident of iteration, not a real preference.
  // Rule: cheaper total cost wins, then field_id, then coach_id (alphabetical).
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.weekly_cost !== b.weekly_cost) return a.weekly_cost - b.weekly_cost;
    if (a.field_id !== b.field_id) return a.field_id.localeCompare(b.field_id);
    return a.coach_id.localeCompare(b.coach_id);
  });

  const top = candidates.slice(0, 2).map((c, i) => ({ ...c, rank: i + 1 }));

  return { feasible: true, bundles: top, binding_constraint: null, trace };
}