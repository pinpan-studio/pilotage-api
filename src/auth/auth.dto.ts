import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsDateString, IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ConnexionDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(1) mot_de_passe: string;
}
export class RafraichirDto {
  @ApiProperty() @IsString() jeton_rafraichissement: string;
}
export class CreerJetonDto {
  @ApiProperty() @IsUUID() utilisateur_id: string;
  @ApiProperty() @IsString() nom: string;
  @ApiProperty({ type: [String], description: 'Identifiants des projets autorisés' }) @IsArray() @ArrayNotEmpty() @IsUUID('all', { each: true }) projets: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() expire_le?: string;
}
