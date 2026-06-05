import { IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTargetSystemDto {
  @ApiProperty({ description: 'Unique name of the target system' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Connector type', example: 'zabbix' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'Human-readable label' })
  @IsString()
  label: string;

  @ApiProperty({ description: 'Connector-specific configuration object' })
  @IsObject()
  config: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Whether the target system is enabled' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateTargetSystemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
