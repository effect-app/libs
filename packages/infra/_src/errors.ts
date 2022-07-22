
export class NotFoundError {
  public readonly _tag = "NotFoundError"
  public readonly message: string
  constructor(type: string, id: string) {
    this.message = `Didn't find ${type}#${id}`
  }
}

export class ValidationError {
  public readonly _tag = "ValidationError"
  constructor(public readonly errors: ImmutableArray<unknown>) {}
}

export class NotLoggedInError {
  public readonly _tag = "NotLoggedInError"
}

export class UnauthorizedError {
  public readonly _tag = "UnauthorizedError"
}
