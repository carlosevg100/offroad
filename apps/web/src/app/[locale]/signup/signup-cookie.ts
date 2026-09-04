/**
 * The pending signup address lives in a short-lived cookie between the form and the code
 * screen. It sits here rather than in `actions.ts` because a `"use server"` module may only
 * export async functions: exporting a constant from one makes every action in it disappear
 * at runtime, while the type checker stays happy.
 */
export const SIGNUP_EMAIL_COOKIE = "offroad_signup_email";
