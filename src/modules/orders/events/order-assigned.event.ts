export class OrderAssignedEvent {
  constructor(
    public readonly orderId: string,
    public readonly masterId: string,
    public readonly assignedAt: Date,
  ) {}
}
