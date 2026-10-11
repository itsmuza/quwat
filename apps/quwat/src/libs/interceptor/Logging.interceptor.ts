import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger = new Logger(LoggingInterceptor.name);
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType<GqlContextType>() !== 'graphql') return next.handle();
		const started = Date.now();
		const operation = GqlExecutionContext.create(context).getInfo().fieldName;
		this.logger.log(`GraphQL ${operation}`);
		return next.handle().pipe(tap(() => this.logger.log(`GraphQL ${operation}: ${Date.now() - started}ms`)));
	}
}
