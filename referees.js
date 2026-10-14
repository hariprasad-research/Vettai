// referees.js

// Form data-வை சுத்தமான object-ஆக மாற்றும்
export function refereeValues(formData) {
  const age = String(formData.get('age') ?? '').trim();

  return {
    name: String(formData.get('name') ?? '').trim(),
    age: age ? Number(age) : null,
    phone: String(formData.get('phone') ?? '').trim(),
    academyName: String(formData.get('academyName') ?? '').trim()
  };
}

// Supabase row-ஐ app object-ஆக மாற்றும்
export function refereeFromRow(row) {
  return {
    id: row.id,
    instituteId: row.academy_id,
    name: row.name ?? '',
    age: row.age ?? '',
    phone: row.phone ?? '',
    academyName: row.academy_name ?? ''
  };
}

function toDatabaseRow(values, academyId) {
  return {
    academy_id: academyId,
    name: values.name,
    age: values.age,
    phone: values.phone,
    academy_name: values.academyName
  };
}

function validate(values) {
  if (!values.name) {
    throw new Error('Referee name is required.');
  }

  if (
    values.age !== null &&
    (!Number.isFinite(values.age) || values.age < 18 || values.age > 100)
  ) {
    throw new Error('Enter a valid age between 18 and 100.');
  }
}

// Load referees
export async function loadReferees(supabase, academyId) {
  const { data, error } = await supabase
    .from('referees')
    .select('*')
    .eq('academy_id', academyId)
    .order('name');

  if (error) throw error;

  return (data ?? []).map(refereeFromRow);
}

// Add referee
export async function createReferee(supabase, academyId, values) {
  validate(values);

  const { data, error } = await supabase
    .from('referees')
    .insert(toDatabaseRow(values, academyId))
    .select()
    .single();

  if (error) throw error;

  return refereeFromRow(data);
}

// Edit referee
export async function updateReferee(
  supabase, academyId, refereeId, values
) {
  validate(values);

  const { data, error } = await supabase
    .from('referees')
    .update(toDatabaseRow(values, academyId))
    .eq('id', refereeId)
    .eq('academy_id', academyId)
    .select()
    .single();

  if (error) throw error;

  return refereeFromRow(data);
}

// Delete referee
export async function deleteReferee(
  supabase, academyId, refereeId
) {
  const { error } = await supabase
    .from('referees')
    .delete()
    .eq('id', refereeId)
    .eq('academy_id', academyId);

  if (error) throw error;
}