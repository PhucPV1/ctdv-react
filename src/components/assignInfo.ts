export type AssignInfo = {
  name: string;
  breed: string;
  gender: string;
  location: string;
  time: string;
  info: string;
  phone: string;
};

export const initialAssignInfo: AssignInfo = {
  gender: '',
  breed: '',
  info: '',
  location: '',
  name: '',
  phone: '',
  time: '',
};

type KeyInfo = { translate: string; order: number };

export const ContentKeyInfo = new Map<keyof AssignInfo, KeyInfo>([
  ['name', { translate: 'Tên', order: 0 }],
  ['breed', { translate: 'Giống', order: 1 }],
  ['gender', { translate: 'Giới tính', order: 2 }],
  ['location', { translate: 'Khu vực lạc', order: 3 }],
  ['time', { translate: 'Thời gian lạc', order: 4 }],
  ['info', { translate: 'Đặc điểm nhận dạng', order: 5 }],
  ['phone', { translate: 'Sdt liên hệ', order: 6 }],
]);

// Field keys in display order.
export const assignKeys = Array.from(ContentKeyInfo.keys());

export const generateContent = (assignInfo: AssignInfo) => {
  const keys = Object.keys(assignInfo).sort((a, b) => {
    return (
      ContentKeyInfo.get(a as keyof AssignInfo)?.order! -
      ContentKeyInfo.get(b as keyof AssignInfo)?.order!
    );
  }) as Array<keyof AssignInfo>;
  return keys.reduce((content, currentKey) => {
    if (assignInfo[currentKey] !== '') {
      const breakDown = content === '' ? '' : '\n';
      return `${content}${breakDown}${ContentKeyInfo.get(currentKey)
        ?.translate}: ${assignInfo[currentKey]}`;
    }
    return content;
  }, '');
};
