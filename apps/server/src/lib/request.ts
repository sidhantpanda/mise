import { AppError } from "./AppError.js";

export function routeParam(value: string | string[] | undefined, name: string) {
  if (typeof value === "string" && value.length > 0) return value;
  throw new AppError(400, `${name} is required`);
}
