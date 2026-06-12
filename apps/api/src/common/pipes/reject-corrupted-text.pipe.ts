import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const UNICODE_REPLACEMENT_CHARACTER = '\uFFFD';

function hasCorruptedText(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.includes(UNICODE_REPLACEMENT_CHARACTER);
  }

  if (Array.isArray(value)) {
    return value.some(hasCorruptedText);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some(hasCorruptedText);
  }

  return false;
}

@Injectable()
export class RejectCorruptedTextPipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata) {
    if (hasCorruptedText(value)) {
      throw new BadRequestException(
        'Texto com caracteres corrompidos. Reenvie o conteúdo usando UTF-8.',
      );
    }

    return value;
  }
}
