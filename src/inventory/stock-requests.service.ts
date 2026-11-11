import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, StockRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApproveStockRequestDto,
  CreateStockRequestDto,
  ListStockRequestsDto,
  ReasonDto,
} from './inventory.dto';
import {
  positiveLines,
  StockTransfersService,
} from './stock-transfers.service';

const person = { select: { id: true, name: true } };
const place = { select: { id: true, name: true, code: true } };

const requestDetail = {
  sourceLocation: place,
  destinationLocation: place,
  requestedBy: person,
  reviewedBy: person,
  transfer: { select: { id: true, status: true } },
  lines: {
    include: { item: { include: { baseUnit: true } } },
    orderBy: { item: { name: 'asc' } },
  },
} satisfies Prisma.StockRequestInclude;

/** A location asking another for stock. Approving it creates the transfer that moves the stock. */
@Injectable()
export class StockRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transfers: StockTransfersService,
  ) {}

  async list(tenantId: string, query: ListStockRequestsDto) {
    const search = query.search?.trim();
    const where: Prisma.StockRequestWhereInput = {
      tenantId,
      status: query.status,
      ...(query.locationId
        ? {
            OR: [
              { sourceLocationId: query.locationId },
              { destinationLocationId: query.locationId },
            ],
          }
        : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { notes: { contains: search, mode: 'insensitive' } },
                  {
                    lines: {
                      some: {
                        item: {
                          name: { contains: search, mode: 'insensitive' },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    };
    const orderBy = {
      [query.sortBy]: query.sortOrder,
    } as Prisma.StockRequestOrderByWithRelationInput;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockRequest.findMany({
        where,
        include: requestDetail,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.stockRequest.count({ where }),
    ]);
    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const request = await this.prisma.stockRequest.findFirst({
      where: { id, tenantId },
      include: requestDetail,
    });
    if (!request) throw new NotFoundException('Stock request not found');
    return request;
  }

  async create(tenantId: string, actorId: string, dto: CreateStockRequestDto) {
    const replayKey = {
      tenantId_clientRequestId: {
        tenantId,
        clientRequestId: dto.clientRequestId,
      },
    };
    const replay = await this.prisma.stockRequest.findUnique({
      where: replayKey,
      include: requestDetail,
    });
    if (replay) return replay;
    if (dto.sourceLocationId === dto.destinationLocationId)
      throw new UnprocessableEntityException(
        'Source and destination must be different locations',
      );
    const lines = positiveLines(dto.lines);
    const [locationCount, itemCount] = await Promise.all([
      this.prisma.stockLocation.count({
        where: {
          tenantId,
          isActive: true,
          id: { in: [dto.sourceLocationId, dto.destinationLocationId] },
        },
      }),
      this.prisma.inventoryItem.count({
        where: {
          tenantId,
          isActive: true,
          id: { in: lines.map((line) => line.itemId) },
        },
      }),
    ]);
    if (locationCount !== 2)
      throw new NotFoundException('Active stock location not found');
    if (itemCount !== lines.length)
      throw new NotFoundException('Active inventory item not found');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const request = await tx.stockRequest.create({
          data: {
            tenantId,
            clientRequestId: dto.clientRequestId,
            sourceLocationId: dto.sourceLocationId,
            destinationLocationId: dto.destinationLocationId,
            notes: dto.notes?.trim() || null,
            requestedById: actorId,
            lines: { create: lines.map((line) => ({ tenantId, ...line })) },
          },
          include: requestDetail,
        });
        await this.audit(
          tx,
          tenantId,
          actorId,
          'STOCK_REQUEST_SUBMITTED',
          request.id,
          {
            lines: dto.lines,
          } as unknown as Prisma.InputJsonValue,
        );
        return request;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.stockRequest.findUnique({
          where: replayKey,
          include: requestDetail,
        });
        if (winner) return winner;
      }
      throw error;
    }
  }

  /** Approves a submitted request, optionally with reduced quantities, and creates its transfer. */
  async approve(
    tenantId: string,
    actorId: string,
    id: string,
    dto: ApproveStockRequestDto,
  ) {
    const overrides = new Map(
      (dto.lines ?? []).map((line) => [
        line.itemId,
        new Prisma.Decimal(line.quantity),
      ]),
    );
    await this.prisma.$transaction(async (tx) => {
      const request = await this.lockSubmitted(tx, tenantId, id);
      const lines = await tx.stockRequestLine.findMany({
        where: { tenantId, requestId: id },
      });
      for (const itemId of overrides.keys())
        if (!lines.some((line) => line.itemId === itemId))
          throw new UnprocessableEntityException(
            'Approved item is not part of this request',
          );
      const approved = lines.map((line) => ({
        line,
        quantity: overrides.get(line.itemId) ?? line.quantity,
      }));
      if (approved.every(({ quantity }) => quantity.lte(0)))
        throw new UnprocessableEntityException(
          'Approve at least one item, or reject the request',
        );
      for (const { line, quantity } of approved)
        await tx.stockRequestLine.update({
          where: { id: line.id },
          data: { approvedQuantity: quantity },
        });
      await tx.stockRequest.update({
        where: { id },
        data: {
          status: StockRequestStatus.APPROVED,
          reviewedById: actorId,
          reviewedAt: new Date(),
          reviewNotes: dto.notes?.trim() || null,
        },
      });
      await this.transfers.createInTransaction(tx, {
        tenantId,
        actorId,
        // The request id doubles as the transfer's replay key: one transfer per request.
        clientRequestId: id,
        requestId: id,
        sourceLocationId: request.sourceLocationId,
        destinationLocationId: request.destinationLocationId,
        notes: request.notes,
        lines: approved
          .filter(({ quantity }) => quantity.gt(0))
          .map(({ line, quantity }) => ({
            itemId: line.itemId,
            quantity: quantity.toString(),
          })),
      });
      await this.audit(tx, tenantId, actorId, 'STOCK_REQUEST_APPROVED', id, {
        lines: approved.map(({ line, quantity }) => ({
          itemId: line.itemId,
          quantity: quantity.toString(),
        })),
      });
    });
    return this.findOne(tenantId, id);
  }

  async reject(tenantId: string, actorId: string, id: string, dto: ReasonDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockSubmitted(tx, tenantId, id);
      await tx.stockRequest.update({
        where: { id },
        data: {
          status: StockRequestStatus.REJECTED,
          reviewedById: actorId,
          reviewedAt: new Date(),
          reviewNotes: dto.reason.trim(),
        },
      });
      await this.audit(tx, tenantId, actorId, 'STOCK_REQUEST_REJECTED', id, {
        reason: dto.reason.trim(),
      });
    });
    return this.findOne(tenantId, id);
  }

  /** Withdraws a request that has not been reviewed yet. */
  async cancel(tenantId: string, actorId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockSubmitted(tx, tenantId, id);
      await tx.stockRequest.update({
        where: { id },
        data: { status: StockRequestStatus.CANCELLED },
      });
      await this.audit(
        tx,
        tenantId,
        actorId,
        'STOCK_REQUEST_CANCELLED',
        id,
        {},
      );
    });
    return this.findOne(tenantId, id);
  }

  private async lockSubmitted(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    await tx.$queryRaw`
      SELECT "id"
      FROM "StockRequest"
      WHERE "id" = ${id}::uuid AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;
    const request = await tx.stockRequest.findFirst({
      where: { id, tenantId },
      select: {
        status: true,
        sourceLocationId: true,
        destinationLocationId: true,
        notes: true,
      },
    });
    if (!request) throw new NotFoundException('Stock request not found');
    if (request.status !== StockRequestStatus.SUBMITTED)
      throw new ConflictException({
        code: 'STOCK_REQUEST_STATUS_INVALID',
        message: `Stock request is ${request.status.toLowerCase()}`,
      });
    return request;
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string,
    action: string,
    entityId: string,
    payload: Prisma.InputJsonValue,
  ) {
    return tx.inventoryAuditEvent.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType: 'StockRequest',
        entityId,
        payload,
      },
    });
  }
}
