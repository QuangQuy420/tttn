import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ListProductsQueryDto } from './list-products-query.dto';
import { IncludeAllStatusesQueryDto } from './include-all-statuses-query.dto';

// Same options as the global pipe in `src/main.ts`.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

function queryOf(metatype: ArgumentMetadata['metatype']): ArgumentMetadata {
  return { type: 'query', metatype, data: '' };
}

describe('includeAllStatuses query flag', () => {
  it('reads "false" as false and "true" as true on the product list query (AC21)', async () => {
    const off = (await pipe.transform(
      { includeAllStatuses: 'false' },
      queryOf(ListProductsQueryDto),
    )) as ListProductsQueryDto;
    const on = (await pipe.transform(
      { includeAllStatuses: 'true' },
      queryOf(ListProductsQueryDto),
    )) as ListProductsQueryDto;

    expect(off.includeAllStatuses).toBe(false);
    expect(on.includeAllStatuses).toBe(true);
  });

  it('reads "false" as false on the product detail query (AC21)', async () => {
    const result = (await pipe.transform(
      { includeAllStatuses: 'false' },
      queryOf(IncludeAllStatusesQueryDto),
    )) as IncludeAllStatusesQueryDto;

    expect(result.includeAllStatuses).toBe(false);
  });
});
