import ToggleButton from '@mui/material/ToggleButton';

export type CategoryOption = 'dog' | 'cat' | 'dogFindOwner' | 'catFindOwner';

const CHIPS: Array<{ value: CategoryOption; label: string }> = [
  { value: 'dog', label: 'Tìm chó lạc' },
  { value: 'cat', label: 'Tìm mèo lạc' },
  { value: 'dogFindOwner', label: 'Chó lạc tìm chủ' },
  { value: 'catFindOwner', label: 'Mèo lạc tìm chủ' },
];

type CategoryChipsProps = {
  value: CategoryOption;
  onChange: (value: CategoryOption) => void;
  disabled: boolean;
};

export default function CategoryChips({
  value,
  onChange,
  disabled,
}: CategoryChipsProps) {
  return (
    <div className="ctdv-chips" role="group" aria-label="Thể loại">
      {CHIPS.map((chip) => (
        <ToggleButton
          key={chip.value}
          value={chip.value}
          selected={chip.value === value}
          disabled={disabled}
          onChange={() => {
            if (chip.value !== value) onChange(chip.value);
          }}
        >
          {chip.label}
        </ToggleButton>
      ))}
    </div>
  );
}
