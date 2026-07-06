import type { HowToStep, RecipeInstruction } from "common";

// Renders a recipe's method as numbered steps, flattening HowToSection groups
// while keeping their section headings. Shared by the household recipe page and
// the public library preview so both render instructions identically.
export function RecipeMethod({ instructions }: { instructions: RecipeInstruction[] }) {
  let stepNumber = 0;

  return (
    <div className="space-y-7">
      {instructions.map((instruction, index) => {
        if (isHowToSection(instruction)) {
          if (instruction.itemListElement.length === 0) return null;

          return (
            <section key={`${instruction.name ?? "section"}-${index}`} className="space-y-4">
              {instruction.name && <h3 className="text-display text-xl">{instruction.name}</h3>}
              <div className="space-y-5">
                {instruction.itemListElement.map((step, stepIndex) => {
                  stepNumber += 1;
                  return (
                    <MethodStep
                      key={`${instruction.name ?? "section"}-${stepIndex}`}
                      number={stepNumber}
                      step={step}
                    />
                  );
                })}
              </div>
            </section>
          );
        }

        stepNumber += 1;
        return <MethodStep key={index} number={stepNumber} step={instruction} />;
      })}
    </div>
  );
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
