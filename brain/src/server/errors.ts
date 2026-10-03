export class NotFoundError extends Error {
  constructor(what = "Item") {
    super(`${what} not found.`);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}
