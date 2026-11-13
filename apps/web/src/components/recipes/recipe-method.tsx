import type { HowToStep, RecipeInstruction } from "common";

// Renders a recipe's method as numbered steps, flattening HowToSection groups
// while keeping their section headings. Shared by the household recipe page and
// the public library preview so both render instructions identically.
export function RecipeMethod({ instructions }: { instructions: RecipeInstruction[] }) {
  return (
    <div className="space-y-7">
      {numberSteps(instructions).map((block, index) => {
        if (block.kind === "section") {
          if (block.steps.length === 0) return null;

          return (
            <section key={`${block.name ?? "section"}-${index}`} className="space-y-4">
              {block.name && <h3 className="text-display text-xl">{block.name}</h3>}
              <div className="space-y-5">
                {block.steps.map(({ number, step }, stepIndex) => (
                  <MethodStep
                    key={`${block.name ?? "section"}-${stepIndex}`}
                    number={number}
                    step={step}
                  />
                ))}
              </div>
            </section>
          );
        }

        return <MethodStep key={index} number={block.number} step={block.step} />;
      })}
    </div>
  );
}

type NumberedStep = { number: number; step: HowToStep };
type MethodBlock =
  ({ kind: "step" } & NumberedStep) | { kind: "section"; name?: string; steps: NumberedStep[] };

// Assigns continuous step numbers across sections up front, so rendering stays
// pure (no counter mutated from inside render callbacks).
function numberSteps(instructions: RecipeInstruction[]): MethodBlock[] {
  const blocks: MethodBlock[] = [];
  let number = 0;
  for (const instruction of instructions) {
    if (isHowToSection(instruction)) {
      const steps: NumberedStep[] = [];
      for (const step of instruction.itemListElement) {
        number += 1;
        steps.push({ number, step });
      }
      blocks.push({ kind: "section", name: instruction.name, steps });
    } else {
      number += 1;
      blocks.push({ kind: "step", number, step: instruction });
    }
  }
  return blocks;
}

function MethodStep({ number, step }: { number: number; step: HowToStep }) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <div className="shrink-0 size-8 sm:size-9 rounded-full bg-primary text-primary-foreground grid place-items-center text-display text-lg">
        {number}
      </div>
      <p className="text-[15px] leading-relaxed pt-1.5">{step.text}</p>
    </div>
  );
}

function isHowToSection(
  instruction: RecipeInstruction,
): instruction is Extract<RecipeInstruction, { "@type": "HowToSection" }> {
  return instruction["@type"] === "HowToSection";
}
