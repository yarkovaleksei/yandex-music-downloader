import { useId } from 'react';
import { SvgIcon, type SvgIconProps } from '@mui/material';

/** Фирменный знак Яндекс Плюса со своим градиентом: цвет темы к нему не применяется. */
export function YandexPlusIcon(props: SvgIconProps) {
  // Несколько значков на странице не должны делить один id градиента.
  const gradient = `yandex-plus-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <SvgIcon viewBox="0 0 1000 1000" {...props}>
      <defs>
        <linearGradient
          id={gradient}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="500"
          x2="1000"
          y2="500"
        >
          <stop offset="0" stopColor="#FF5C4D" />
          <stop offset="0.4" stopColor="#EB469F" />
          <stop offset="1" stopColor="#8341EF" />
        </linearGradient>
      </defs>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={`url(#${gradient})`}
        d="M540 800l97.5-300H1000c0 132.607-52.678 259.785-146.447 353.553C759.785 947.322 632.607 1000 500 1000S240.214 947.322 146.446 853.553C52.678 759.785 0 632.607 0 500s52.678-259.785 146.446-353.553C240.214 52.679 367.392 0 500 0c52.46 0 104.598 8.239 154.5 24.417L540.585 375H207.833l-40.666 125H500l-97.5 300H540zM678.085 375L773.5 81.5C877.847 149.678 953 254.338 984.25 375H678.085z"
      />
    </SvgIcon>
  );
}
