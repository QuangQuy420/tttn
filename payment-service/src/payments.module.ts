import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './db/entities/payment.entity';
import { PaymentsController } from './routes/payments.controller';
import { PaymentsService } from './services/payments.service';
import { TypeOrmPaymentRepository } from './repositories/payment.repository';
import { RabbitMqOrderSagaEventPublisher } from './repositories/order-saga-event-publisher.repository';
import { OrderSagaEventConsumer } from './repositories/order-saga-event-consumer.repository';
import {
  PAYMENT_REPOSITORY,
  ORDER_SAGA_EVENT_PUBLISHER,
} from './repositories/tokens';

/**
 * Payments feature module: the checkout saga's payment step (`payment.create.requested` in,
 * `payment.completed`/`payment.failed` out) plus the debug `GET /payments/:orderId` lookup.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Payment])],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    OrderSagaEventConsumer,
    { provide: PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    {
      provide: ORDER_SAGA_EVENT_PUBLISHER,
      useClass: RabbitMqOrderSagaEventPublisher,
    },
  ],
})
export class PaymentsModule {}
