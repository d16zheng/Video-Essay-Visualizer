export class ProjectConflictError extends Error {
  constructor() {
    super("This project changed since it was opened. Your local edits were not saved.");
    this.name = "ProjectConflictError";
  }
}

export class ProjectNotFoundError extends Error {
  constructor() {
    super("Project not found.");
    this.name = "ProjectNotFoundError";
  }
}

export function toProjectSaveApiError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
} {
  if (error instanceof ProjectConflictError) {
    return { statusCode: 409, code: "project_conflict", message: error.message };
  }
  if (error instanceof ProjectNotFoundError) {
    return { statusCode: 404, code: "project_not_found", message: error.message };
  }
  return { statusCode: 500, code: "project_save_error", message: "Unable to save project." };
}
