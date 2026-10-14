// Supabase authentication calls. UI/session decisions remain in app.js.
export async function signInWithPassword(client, email, password) {
  return client.auth.signInWithPassword({ email, password });
}
export async function signUpAcademy(client, values) {
  return client.auth.signUp({ email: values.email.toLowerCase(), password: values.password, options: { data: { academy_name: values.academyName, master_name: values.masterName, phone: values.phone } } });
}
export async function signOut(client) { return client.auth.signOut(); }
