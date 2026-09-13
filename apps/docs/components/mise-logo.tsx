import { CookingPot } from 'lucide-react';

export function MiseLogo() {
  return (
    <span className="mise-logo" aria-label="Mise home">
      <span className="mise-logo-mark"><CookingPot aria-hidden="true" /></span>
      <span className="mise-logo-word">Mise</span>
      <span className="mise-logo-suffix">docs</span>
    </span>
  );
}
