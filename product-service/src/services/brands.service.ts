import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Brand } from '../db/entities/brand.entity';
import { IBrandRepository } from '../repositories/brand.repository';
import { BRAND_REPOSITORY } from '../repositories/tokens';
import { CreateBrandDto } from '../routes/dto/create-brand.dto';
import { BrandResponseDto } from '../routes/dto/brand-response.dto';
import { UpdateBrandDto } from '../routes/dto/update-brand.dto';

@Injectable()
export class BrandsService {
  constructor(
    @Inject(BRAND_REPOSITORY)
    private readonly brandRepository: IBrandRepository,
  ) {}

  async findAll(): Promise<BrandResponseDto[]> {
    const brands = await this.brandRepository.findAll();
    return brands.map((brand) => this.toResponseDto(brand));
  }

  async findOne(id: string): Promise<BrandResponseDto> {
    const brand = await this.brandRepository.findById(id);
    if (!brand) {
      throw new NotFoundException('Không tìm thấy thương hiệu.');
    }
    return this.toResponseDto(brand);
  }

  async create(dto: CreateBrandDto): Promise<BrandResponseDto> {
    const name = dto.name.trim();
    await this.assertNameAvailable(name);

    try {
      const brand = await this.brandRepository.create({
        name,
        logoUrl: dto.logoUrl ?? null,
        description: dto.description ?? null,
      });
      return this.toResponseDto(brand);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Tên thương hiệu đã tồn tại.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateBrandDto): Promise<BrandResponseDto> {
    const existing = await this.brandRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy thương hiệu.');
    }

    const name = dto.name?.trim();
    if (name !== undefined) {
      await this.assertNameAvailable(name, id);
    }

    try {
      const brand = await this.brandRepository.update(id, {
        ...(name !== undefined ? { name } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      });
      if (!brand) {
        throw new NotFoundException('Không tìm thấy thương hiệu.');
      }
      return this.toResponseDto(brand);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Tên thương hiệu đã tồn tại.');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const brand = await this.brandRepository.findById(id);
    if (!brand) {
      throw new NotFoundException('Không tìm thấy thương hiệu.');
    }

    if (await this.brandRepository.countProducts(id)) {
      throw new ConflictException(
        'Không thể xoá thương hiệu vì vẫn còn sản phẩm đang sử dụng. Vui lòng chuyển hoặc xoá sản phẩm trước.',
      );
    }

    try {
      await this.brandRepository.delete(id);
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Không thể xoá thương hiệu vì vẫn còn sản phẩm đang sử dụng. Vui lòng chuyển hoặc xoá sản phẩm trước.',
        );
      }
      throw error;
    }
  }

  private async assertNameAvailable(name: string, id?: string): Promise<void> {
    const existing = await this.brandRepository.findByNameKey(
      this.toNameKey(name),
    );
    if (existing && existing.id !== id) {
      throw new ConflictException('Tên thương hiệu đã tồn tại.');
    }
  }

  private toNameKey(name: string): string {
    return name.trim().toLowerCase();
  }

  private isUniqueViolation(error: unknown): boolean {
    return this.getDatabaseErrorCode(error) === '23505';
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return this.getDatabaseErrorCode(error) === '23503';
  }

  private getDatabaseErrorCode(error: unknown): string | undefined {
    if (!(error instanceof QueryFailedError)) return undefined;
    return (error.driverError as { code?: string }).code;
  }

  private toResponseDto(brand: Brand): BrandResponseDto {
    return {
      id: brand.id,
      name: brand.name,
      logoUrl: brand.logoUrl,
      description: brand.description,
    };
  }
}
