export class OrderCreatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly districtId: string,
    public readonly specialtyId: string | null,
    public readonly createdAt: Date,
  ) {}
}
