import { PaymentStatus } from '../../db/enums/payment-status.enum';

export class PaymentResponseDto {
  id: string;
  orderId: string;
  userId: string;
  orderCode: string;
  amount: number;
  paymentMethod: string;
  status: PaymentStatus;
  transactionCode: string | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
