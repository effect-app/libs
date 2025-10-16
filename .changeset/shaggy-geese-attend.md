---
"@effect-app/vue-components": minor
"@effect-app/vue": minor
---

improve: split wait vs blocked state and add allowed state

# Allowed states

Adds support to model allowed states, e.g based on roles, so that you can conditionally render buttons based on role memberships or other states.
Could work together with role assignments configured on API Mutations, combined with the user's role memberships hook.

# Blocked state

When an entity mutation is in progress, you may want to block overlapping actions, not just the clicked button.
While `waiting` state is managing both the disabled and loading state of a button, `blocked` only affects the disabled state.
This way you can separate which buttons show loading state and which are only blocked.
Controlled via `blockKey` and `waitKey` options.
