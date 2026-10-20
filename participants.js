
/**
 * Participant data mapping shared by Supabase reads and writes.
 */
export function participantFromRow(row) {
  let events = [];

  try {
    events = Array.isArray(row.events)
      ? row.events
      : JSON.parse(row.events || '[]');
  } catch {
    events = [];
  }

  return {
    id: row.participant_code,
    dbId: row.id,
    instituteId: row.academy_id,
    name: row.name,
    age: row.age,
    gender: row.gender || '',
    weight: row.weight ?? '',
    events,
    category: events.length === 2
      ? 'BOTH'
      : (events[0] || ''),
    createdAt: row.created_at
      ? row.created_at.slice(0, 10)
      : ''
  };
}

export function participantPayload(values) {
  return {
    name: values.name,
    age: values.age,
    gender: values.gender || null,
    weight: values.weight ? Number(values.weight) : null,
    events: JSON.stringify(values.events)
  };
}

export function newParticipantPayload(values, participantCode) {
  return {
    participant_code: participantCode,
    academy_id: values.instituteId,
    ...participantPayload(values)
  };
}
