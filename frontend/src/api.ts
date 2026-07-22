import type { ApiFailure, Capability } from "./types";

export class ViewerApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function selectedImageId(search = window.location.search): number | null {
  const value = new URLSearchParams(search).get("image");
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function fetchCapabilities(imageId: number): Promise<Capability> {
  const template = window.BIOMERO_ZARR_VIEWER.capabilitiesTemplate;
  const url = template.replace(/\/0\/capabilities\/$/, `/${imageId}/capabilities/`);
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
  let payload: Capability | ApiFailure;
  try {
    payload = await response.json() as Capability | ApiFailure;
  } catch {
    throw new ViewerApiError("invalid_response", "The viewer service returned an invalid response", response.status);
  }
  if (!response.ok || !payload.supported) {
    const failure = payload as ApiFailure;
    throw new ViewerApiError(failure.error?.code || "request_failed", failure.error?.message || "The viewer request failed", response.status);
  }
  if (payload.schema_version !== 1) {
    throw new ViewerApiError("unsupported_schema", "The server returned an unsupported viewer schema", response.status);
  }
  return payload;
}

