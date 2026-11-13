import { ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

export const refuse = (msg: string) => new ForbiddenException(`Refusé : ${msg}`);
export const introuvable = (msg: string) => new NotFoundException(`Introuvable : ${msg}`);
export const invalide = (msg: string) => new BadRequestException(`Invalide : ${msg}`);
export const conflit = (msg: string) => new ConflictException(`Conflit : ${msg}`);
