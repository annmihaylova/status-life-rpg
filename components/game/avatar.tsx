/**
 * Портрет персонажа (по пояс) в SVG: слои кожи, волос, глаз, одежды и аксессуаров.
 * Оригинальная графика в аниме-стиле, без чужих ассетов (SPEC 6.2).
 */
import { useId } from "react";
import { isLight, shade, type AvatarConfig } from "@/lib/game/avatar";

const FACE = "M70,82 C70,52 130,52 130,82 L130,98 C130,120 113,134 100,134 C87,134 70,120 70,98 Z";
const BODY = "M34,200 C34,164 62,148 100,148 C138,148 166,164 166,200 Z";

export function Avatar({
  config: c,
  size = 160,
  label,
  className,
}: {
  config: AvatarConfig;
  size?: number;
  label: string;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const has = (a: AvatarConfig["accessories"][number]) => c.accessories.includes(a);
  const skinShade = shade(c.skin, -0.14);
  const hairDark = shade(c.hairColor, -0.28);
  const hairLight = shade(c.hairColor, 0.22);
  const cloth = c.outfitColor;
  const clothDark = shade(cloth, -0.25);
  const detail = isLight(cloth) ? "#2b2d42" : "#f2f2f5";

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={className}
    >
      <defs>
        <radialGradient id={`aura${uid}`} cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={c.aura} stopOpacity="0.55" />
          <stop offset="70%" stopColor={c.aura} stopOpacity="0.12" />
          <stop offset="100%" stopColor={c.aura} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`hair${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hairLight} />
          <stop offset="55%" stopColor={c.hairColor} />
          <stop offset="100%" stopColor={hairDark} />
        </linearGradient>
        <linearGradient id={`cloth${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={shade(cloth, 0.08)} />
          <stop offset="100%" stopColor={clothDark} />
        </linearGradient>
        <clipPath id={`frame${uid}`}>
          <rect width="200" height="200" rx="28" />
        </clipPath>
      </defs>

      <g clipPath={`url(#frame${uid})`}>
        <rect width="200" height="200" fill="rgb(255 255 255 / 0.03)" />
        <circle cx="100" cy="96" r="98" fill={`url(#aura${uid})`} />

        {/* персонаж крупнее рамки: голова и плечи заполняют портрет */}
        <g transform="translate(100 118) scale(1.22) translate(-100 -112)">
          <HairBack style={c.hairStyle} fill={`url(#hair${uid})`} />

          {/* шея и тело */}
          <path d="M89,122 L111,122 L113,152 C106,158 94,158 87,152 Z" fill={skinShade} />
          <Outfit kind={c.outfit} fill={`url(#cloth${uid})`} dark={clothDark} detail={detail} />

          {/* голова */}
          <ellipse cx="69" cy="98" rx="6" ry="9" fill={skinShade} />
          <ellipse cx="131" cy="98" rx="6" ry="9" fill={skinShade} />
          <path d={FACE} fill={c.skin} />
          <path
            d="M74,112 C80,128 92,134 100,134 C108,134 120,128 126,112 C118,124 108,128 100,128 C92,128 82,124 74,112 Z"
            fill={skinShade}
            opacity="0.35"
          />

          <Eyes shape={c.eyeShape} color={c.eyeColor} />
          <path
            d="M78,85 Q86,80 94,85"
            stroke={hairDark}
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M106,85 Q114,80 122,85"
            stroke={hairDark}
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M100,103 Q103,110 99,113"
            stroke={shade(c.skin, -0.3)}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
          <Mouth expression={c.expression} />

          {has("blush") && (
            <g fill="#ff7a9a" opacity="0.28">
              <ellipse cx="80" cy="112" rx="7" ry="4" />
              <ellipse cx="120" cy="112" rx="7" ry="4" />
            </g>
          )}
          {has("freckles") && (
            <g fill={shade(c.skin, -0.38)} opacity="0.7">
              {[
                [82, 108],
                [86, 111],
                [79, 112],
                [118, 108],
                [114, 111],
                [121, 112],
              ].map(([x, y]) => (
                <circle key={`${x}${y}`} cx={x} cy={y} r="0.9" />
              ))}
            </g>
          )}

          <HairFront style={c.hairStyle} fill={`url(#hair${uid})`} dark={hairDark} />

          {has("earrings") && (
            <g fill="#ffd46b">
              <circle cx="69" cy="108" r="2.6" />
              <circle cx="131" cy="108" r="2.6" />
            </g>
          )}
          {has("glasses_round") && (
            <g stroke="#1e1e26" strokeWidth="2" fill="rgb(255 255 255 / 0.1)">
              <circle cx="86" cy="98" r="10" />
              <circle cx="114" cy="98" r="10" />
              <path d="M96,97 Q100,94 104,97" fill="none" />
            </g>
          )}
          {has("glasses_square") && (
            <g stroke="#1e1e26" strokeWidth="2" fill="rgb(255 255 255 / 0.1)">
              <rect x="75" y="90" width="22" height="16" rx="4" />
              <rect x="103" y="90" width="22" height="16" rx="4" />
              <path d="M97,96 L103,96" fill="none" />
            </g>
          )}
          {has("headband") && (
            <path
              d="M70,74 C78,52 122,52 130,74"
              stroke={c.aura}
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
            />
          )}
          {has("cap") && (
            <g>
              <path d="M66,78 C64,44 136,44 134,78 Z" fill={cloth} />
              <path
                d="M66,78 C80,72 120,72 134,78 C138,82 150,82 156,80 C150,74 140,70 134,70"
                fill={clothDark}
              />
              <circle cx="100" cy="48" r="3" fill={clothDark} />
            </g>
          )}
          {has("headphones") && (
            <g>
              <path d="M64,94 C60,40 140,40 136,94" stroke="#2a2a35" strokeWidth="6" fill="none" />
              <rect x="57" y="86" width="14" height="24" rx="6" fill="#2a2a35" />
              <rect x="129" y="86" width="14" height="24" rx="6" fill="#2a2a35" />
              <rect x="60" y="90" width="8" height="16" rx="4" fill={c.aura} opacity="0.8" />
              <rect x="132" y="90" width="8" height="16" rx="4" fill={c.aura} opacity="0.8" />
            </g>
          )}
        </g>
      </g>
      <rect width="200" height="200" rx="28" fill="none" stroke={c.aura} strokeOpacity="0.45" />
    </svg>
  );
}

function Eyes({ shape, color }: { shape: AvatarConfig["eyeShape"]; color: string }) {
  const ry = shape === "round" ? 8 : 6;
  const rx = shape === "round" ? 7 : 8;
  return (
    <g>
      {[86, 114].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="98" rx={rx} ry={ry} fill="#fbfbff" />
          <circle cx={x} cy={98.5} r={shape === "round" ? 5.4 : 4.8} fill={color} />
          <circle cx={x} cy={99.5} r="2.6" fill={shade(color, -0.6)} />
          <circle cx={x + 2} cy={96} r="1.7" fill="#fff" />
          <circle cx={x - 2} cy={101} r="0.9" fill="#fff" opacity="0.8" />
          <path
            d={`M${x - rx - 1},${98 - ry + 3} Q${x},${98 - ry - 3} ${x + rx + 1},${98 - ry + 3}`}
            stroke="#1b1a1f"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      ))}
    </g>
  );
}

function Mouth({ expression }: { expression: AvatarConfig["expression"] }) {
  if (expression === "calm") {
    return (
      <path
        d="M94,120 Q100,122 106,120"
        stroke="#8a3d45"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  if (expression === "grin") {
    return (
      <g>
        <path d="M92,117 Q100,128 108,117 Z" fill="#8a3d45" />
        <path d="M94,118 L106,118 L105,120 L95,120 Z" fill="#fff" />
      </g>
    );
  }
  return (
    <path
      d="M93,118 Q100,124 107,118"
      stroke="#8a3d45"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
  );
}

function HairBack({ style, fill }: { style: AvatarConfig["hairStyle"]; fill: string }) {
  switch (style) {
    case "bob":
      return (
        <path
          d="M62,86 C58,50 80,38 100,38 C120,38 142,50 138,86 L140,128 C132,136 120,136 115,128 L85,128 C80,136 68,136 60,128 Z"
          fill={fill}
        />
      );
    case "long":
      return (
        <path
          d="M60,86 C56,48 80,36 100,36 C120,36 144,48 140,86 L148,176 C136,184 122,180 118,166 L82,166 C78,180 64,184 52,176 Z"
          fill={fill}
        />
      );
    case "ponytail":
      return <path d="M126,66 C156,74 160,124 142,150 C140,124 134,100 122,86 Z" fill={fill} />;
    case "bun":
      return <circle cx="100" cy="40" r="15" fill={fill} />;
    case "curly":
      return (
        <g fill={fill}>
          {[
            [66, 82, 15],
            [64, 104, 13],
            [70, 122, 11],
            [134, 82, 15],
            [136, 104, 13],
            [130, 122, 11],
          ].map(([x, y, r]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function HairFront({
  style,
  fill,
  dark,
}: {
  style: AvatarConfig["hairStyle"];
  fill: string;
  dark: string;
}) {
  switch (style) {
    case "short":
    case "ponytail":
    case "bun":
      return (
        <g>
          <path
            d="M66,92 C62,56 80,44 100,44 C122,44 138,56 134,92 C130,76 122,66 106,64 C98,72 84,76 70,80 Z"
            fill={fill}
          />
          <path
            d="M106,64 C112,70 118,74 126,76"
            stroke={dark}
            strokeWidth="1.2"
            fill="none"
            opacity="0.5"
          />
        </g>
      );
    case "bob":
      return (
        <path
          d="M68,90 C64,56 84,46 100,46 C118,46 136,56 132,90 C126,72 118,68 112,67 C108,75 100,77 92,73 C86,78 78,82 70,94 Z"
          fill={fill}
        />
      );
    case "long":
      return (
        <g fill={fill}>
          <path d="M68,90 C64,54 84,44 100,44 C118,44 136,54 132,90 C128,74 116,66 100,66 C86,66 74,74 68,90 Z" />
          <path d="M70,92 C64,122 64,152 70,178 C78,170 78,140 78,110 Z" />
          <path d="M130,92 C136,122 136,152 130,178 C122,170 122,140 122,110 Z" />
        </g>
      );
    case "curly":
      return (
        <g fill={fill}>
          {[
            [72, 70, 13],
            [84, 56, 14],
            [100, 50, 15],
            [116, 56, 14],
            [128, 70, 13],
            [92, 66, 9],
            [110, 66, 9],
          ].map(([x, y, r]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      );
    case "buzz":
      return (
        <path
          d="M70,86 C68,58 84,48 100,48 C116,48 132,58 130,86 C126,70 116,62 100,62 C84,62 74,70 70,86 Z"
          fill={fill}
          opacity="0.92"
        />
      );
    case "sidepart":
      return (
        <g fill={fill}>
          <path d="M66,94 C60,56 82,42 102,42 C124,42 140,58 134,94 C128,74 116,64 96,66 C88,68 80,74 72,86 Z" />
          <path d="M96,66 C112,58 126,66 132,84 C122,74 110,70 96,66 Z" />
        </g>
      );
    default:
      return null;
  }
}

function Outfit({
  kind,
  fill,
  dark,
  detail,
}: {
  kind: AvatarConfig["outfit"];
  fill: string;
  dark: string;
  detail: string;
}) {
  switch (kind) {
    case "hoodie":
      return (
        <g>
          <path d="M60,160 C64,140 82,136 100,140 C118,136 136,140 140,160 Z" fill={dark} />
          <path d={BODY} fill={fill} />
          <path d="M84,150 C90,162 110,162 116,150" stroke={dark} strokeWidth="3" fill="none" />
          <path
            d="M94,158 L92,178 M106,158 L108,178"
            stroke={detail}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d="M76,186 L124,186 L120,200 L80,200 Z" fill={dark} opacity="0.5" />
        </g>
      );
    case "shirt":
      return (
        <g>
          <path d={BODY} fill={fill} />
          <path d="M86,148 L100,166 L94,170 L80,152 Z" fill="#f2f2f5" />
          <path d="M114,148 L100,166 L106,170 L120,152 Z" fill="#f2f2f5" />
          <path d="M100,166 L100,200" stroke={dark} strokeWidth="1.5" />
          {[174, 184, 194].map((y) => (
            <circle key={y} cx="103" cy={y} r="1.6" fill={detail} />
          ))}
        </g>
      );
    case "sweater":
      return (
        <g>
          <path d={BODY} fill={fill} />
          <path d="M86,140 L114,140 L116,156 C106,160 94,160 84,156 Z" fill={dark} />
          {[90, 96, 102, 108].map((x) => (
            <path key={x} d={`M${x},142 L${x},156`} stroke={fill} strokeWidth="1.2" opacity="0.6" />
          ))}
        </g>
      );
    case "jacket":
      return (
        <g>
          <path d={BODY} fill={fill} />
          <path d="M88,152 L100,200 L112,152 C106,158 94,158 88,152 Z" fill="#f2f2f5" />
          <path d="M86,150 L98,200 L84,200 L72,166 Z" fill={dark} />
          <path d="M114,150 L102,200 L116,200 L128,166 Z" fill={dark} />
        </g>
      );
    case "dress":
      return (
        <g>
          <path d="M60,200 C60,176 70,164 82,160 L118,160 C130,164 140,176 140,200 Z" fill={fill} />
          <path
            d="M82,160 L84,148 M118,160 L116,148"
            stroke={fill}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M82,160 C90,168 110,168 118,160" stroke={dark} strokeWidth="2" fill="none" />
        </g>
      );
    case "labcoat":
      return (
        <g>
          <path d={BODY} fill="#eef0f6" />
          <path d="M88,150 L100,190 L112,150 C106,156 94,156 88,150 Z" fill={fill} />
          <path d="M86,148 L98,196 L82,200 L72,164 Z" fill="#d9dce6" />
          <path d="M114,148 L102,196 L118,200 L128,164 Z" fill="#d9dce6" />
          <rect x="120" y="176" width="12" height="10" rx="1.5" fill="#d9dce6" />
          <path d="M123,176 L123,170" stroke="#4f7ee8" strokeWidth="1.6" />
        </g>
      );
    case "sport":
      return (
        <g>
          <path d={BODY} fill={fill} />
          <path d="M100,152 L100,200" stroke={detail} strokeWidth="1.6" />
          <path
            d="M44,178 C52,168 60,162 68,158 M156,178 C148,168 140,162 132,158"
            stroke={detail}
            strokeWidth="3"
            fill="none"
            opacity="0.8"
          />
          <path d="M88,150 C92,156 108,156 112,150" stroke={dark} strokeWidth="3" fill="none" />
        </g>
      );
    default:
      return (
        <g>
          <path d={BODY} fill={fill} />
          <path d="M86,150 C90,160 110,160 114,150" stroke={dark} strokeWidth="3" fill="none" />
        </g>
      );
  }
}
