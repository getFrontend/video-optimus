import UseAnimations, { type UseAnimationsProps } from "react-useanimations";

export function AnimatedIcon(props: UseAnimationsProps) {
  return (
    <UseAnimations
      {...props}
      strokeColor="currentColor"
      fillColor="currentColor"
    />
  );
}
