import { Controller, Get, Logger } from '@nestjs/common';
import { QuwatBatchService } from './quwat-batch.service';
import { Cron, Timeout } from '@nestjs/schedule';
import { BATCH_ROLLBACK, BATCH_TOP_AGENTS, BATCH_TOP_PRODUCTS } from './lib/config';

@Controller()
export class QuwatBatchController {
	private logger: Logger = new Logger('BatchController');
	constructor(private readonly batchService: QuwatBatchService) {}

	@Timeout(1000)
	handleTimeout() {
		this.logger.debug('Batch server ready');
	}

	// @Interval(1000)
	// handleInterval() {
	// 	this.logger.debug('INTERVAL TEST');
	// }

	// @Cron('00 * * * * *', { name: 'CRON_TEST' })
	// cronTest() {
	// 	this.logger['context'] = 'CRON_TEST';
	// 	this.logger.debug('EXECUTED');
	// }

	@Cron('0 0 1 * * *', { name: BATCH_ROLLBACK })
	async batchRollback() {
		try {
			this.logger['context'] = BATCH_ROLLBACK;
			this.logger.debug('Executed');
			await this.batchService.batchRollback();
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Cron('20 0 1 * * *', { name: BATCH_TOP_PRODUCTS })
	async batchProducts() {
		try {
			this.logger['context'] = BATCH_TOP_PRODUCTS;
			this.logger.debug('Executed');
			await this.batchService.batchTopProducts();
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Cron('40 0 1 * * *', { name: BATCH_TOP_AGENTS })
	async batchAgents() {
		try {
			this.logger['context'] = BATCH_TOP_AGENTS;
			this.logger.debug('Executed');
			await this.batchService.batchTopAgents();
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Get()
	getHello(): string {
		return this.batchService.getHello();
	}
}
