export class NotificationError extends Error {
  constructor(message: string, public readonly configuration = false) {
    super(message);
    this.name = 'NotificationError';
  }
}
