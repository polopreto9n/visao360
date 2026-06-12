import { BadRequestException } from '@nestjs/common';
import { RejectCorruptedTextPipe } from './reject-corrupted-text.pipe';

describe('RejectCorruptedTextPipe', () => {
  const pipe = new RejectCorruptedTextPipe();
  const metadata = { type: 'body' as const };

  it('preserves valid UTF-8 text in nested input', () => {
    const value = {
      name: 'Inspeção Mensal de Elevador',
      items: [{ question: 'Iluminação da cabine funciona?' }],
    };

    expect(pipe.transform(value, metadata)).toBe(value);
  });

  it('rejects text that already contains the Unicode replacement character', () => {
    expect(() => pipe.transform({ name: 'Inspe��o' }, metadata)).toThrow(BadRequestException);
  });
});
