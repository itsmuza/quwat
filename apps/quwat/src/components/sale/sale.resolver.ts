import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { SaleService } from './sale.service';
import { Sale, Sales, DailySalesReport, SaleNotifications } from '../../libs/dto/sale/sale';
import { SaleInboxService } from './sale-inbox.service';
import {
	AdminSalesInquiry,
	DailySalesInput,
	RequestSaleInput,
	SaleIdInput,
	SalesInquiry,
} from '../../libs/dto/sale/sale.input';
import { OrdinaryInquiry } from '../../libs/dto/product/product.input';
import { Member } from '../../libs/dto/member/member';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
@Resolver()
export class SaleResolver {
	constructor(
		private readonly sales: SaleService,
		private readonly inbox: SaleInboxService,
	) {}
	@Roles(MemberType.CLIENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Sale)
	requestSale(@Args('input') input: RequestSaleInput, @AuthMember() member: Member) {
		return this.sales.requestSale(member, input);
	}
	@Roles(MemberType.CLIENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Sale)
	cancelSale(@Args('input') input: SaleIdInput, @AuthMember() member: Member) {
		return this.sales.cancelSale(member, input);
	}
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Sale)
	approveSale(@Args('input') input: SaleIdInput, @AuthMember() member: Member) {
		return this.sales.approveSale(member, input);
	}
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Sale)
	rejectSale(@Args('input') input: SaleIdInput, @AuthMember() member: Member) {
		return this.sales.rejectSale(member, input);
	}
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => SaleNotifications)
	getSaleNotifications(@Args('input') input: OrdinaryInquiry, @AuthMember() member: Member) {
		return this.inbox.getSaleNotifications(member, input);
	}
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Sale)
	getSaleForAgent(@Args('input') input: SaleIdInput, @AuthMember() member: Member) {
		return this.inbox.getSaleForAgent(member, input);
	}
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Boolean)
	markSaleNotificationRead(@Args('input') input: SaleIdInput, @AuthMember() member: Member) {
		return this.inbox.markSaleNotificationRead(member, input);
	}
	@Roles(MemberType.CLIENT)
	@UseGuards(RolesGuard)
	@Query(() => Sales)
	getMySales(@Args('input') input: SalesInquiry, @AuthMember() member: Member) {
		return this.sales.getMySales(member, input);
	}
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Sales)
	getPendingSales(@Args('input') input: OrdinaryInquiry, @AuthMember() member: Member) {
		return this.sales.getPendingSales(member, input);
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Sales)
	getAllSalesByAdmin(@Args('input') input: AdminSalesInquiry, @AuthMember() member: Member) {
		return this.sales.getAllSalesByAdmin(member, input);
	}
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => DailySalesReport)
	getDailySalesByAdmin(@Args('input') input: DailySalesInput, @AuthMember() member: Member) {
		return this.sales.getDailySalesByAdmin(member, input);
	}
}
