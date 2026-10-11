import { NestFactory } from '@nestjs/core';
import { QuwatBatchModule } from './quwat-batch.module';

async function bootstrap() {
	const app = await NestFactory.create(QuwatBatchModule);
	await app.listen(process.env.PORT_BATCH ?? 3000);
}
bootstrap();
