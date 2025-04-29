# Storybook Stories

This folder contains all the Storybook stories for the Vue Components package. Each story file corresponds to a component and demonstrates its various use cases and configurations.

## Structure

- Each story file is named after the component it's documenting (e.g., `OmegaForm.stories.ts`)
- Stories are organized by component type and functionality
- Each story includes proper TypeScript typing and documentation

## Running Stories

To run the Storybook:

```bash
pnpm storybook
```

This will start Storybook on port 6006, and you can view your components at http://localhost:6006.

## Adding New Stories

When adding a new story:

1. Create a new file in this folder with the naming pattern `ComponentName.stories.ts`
2. Import the component and any dependencies
3. Define the meta object with component information
4. Create story objects that demonstrate different use cases
5. Use proper TypeScript typing for all parameters 
