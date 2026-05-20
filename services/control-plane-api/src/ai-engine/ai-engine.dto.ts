import { IsString, IsNotEmpty, IsEmail, IsIP, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeAbuseDto {
  @ApiProperty({ description: 'Asunto del email a analizar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(998)
  subject!: string;

  @ApiProperty({ description: 'Cuerpo del email a analizar' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiProperty({ description: 'Dirección email del remitente' })
  @IsEmail()
  fromEmail!: string;

  @ApiProperty({ description: 'IP del remitente' })
  @IsIP()
  ip!: string;
}

export class ClassifyMailDto {
  @ApiProperty({ description: 'Asunto del email' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(998)
  subject!: string;

  @ApiProperty({ description: 'Cuerpo del email' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiProperty({ description: 'Dirección email del remitente' })
  @IsEmail()
  fromEmail!: string;
}

export class DiagnoseSupportDto {
  @ApiProperty({ description: 'Pregunta o problema a diagnosticar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  question!: string;
}

export class ExtractInvoiceDto {
  @ApiProperty({ description: 'Texto de la factura a procesar' })
  @IsString()
  @IsNotEmpty()
  text!: string;
}
