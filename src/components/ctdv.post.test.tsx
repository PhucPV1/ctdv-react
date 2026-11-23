import { render, screen, fireEvent } from '@testing-library/react';
import Ctdv from './ctdv';

jest.mock('../utils/aiGen', () => ({
  generateWithAIStream: async function* (_rawContent: string, _title: string) {
    yield 'A';
  },
}));

const FIND_PET_FOOTER =
  'Nhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà. Mình cảm ơn và xin chân thành hậu tạ cho ai giúp tìm được bé ạ.';
const FIND_OWNER_FOOTER =
  'Nhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà ạ. Mình xin cảm ơn.';

function renderWithContent(content: string) {
  render(<Ctdv />);
  const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
  const contentArea = textareas[0];
  const postArea = textareas[textareas.length - 1];
  fireEvent.change(contentArea, { target: { value: content } });
  return { contentArea, postArea };
}

test('post format for the default category is byte-identical', () => {
  const { postArea } = renderWithContent('milu\npoodle nâu');

  expect(postArea.value).toBe(
    `TÌM CHÓ LẠC\n    \nMilu\nPoodle nâu\n    \n${FIND_PET_FOOTER}`,
  );
});

test('post applies the text replacements in order', () => {
  const { postArea } = renderWithContent(
    'giống chó/mèo : poodle ( nâu ) , đực\nthời gian lạc / mất: tối 23/11',
  );

  expect(postArea.value).toBe(
    `TÌM CHÓ LẠC\n    \nGiống chó/mèo: poodle (nâu), đực\nThời gian lạc: tối 23/11\n    \n${FIND_PET_FOOTER}`,
  );
});

test('post format for a find-owner category is byte-identical', () => {
  const { postArea } = renderWithContent('milu\npoodle nâu');

  fireEvent.click(screen.getByRole('button', { name: 'Chó lạc tìm chủ' }));

  expect(postArea.value).toBe(
    `CHÓ LẠC TÌM CHỦ\n    \nMilu\nPoodle nâu\n    \n${FIND_OWNER_FOOTER}`,
  );
});
