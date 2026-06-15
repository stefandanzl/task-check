# Example markdown text:

```markdown
#studium/test1 #prio/10

- [ ] Test #prio/20
```

# Error

Svelte duplicate key error is thrown.

# Conditions for Error to appear

In the tested vault `prio` is defined as the priority tag, which is a user setting.

1. The same value as for the dedicated priority tag `prio` is also defined as another regular tag
2. That tag is enabled in the sidepanel tag toggles
3. `Show priority groups only` is enabled

# Result

This shows that only the main tags have to be duplicated for the same checklist task item
previously we assumed that only the duplicate combination of same maintag + same subtag would throw the Svelte duplicate error.

# Solution

Add the subtags to the definition of Svelte rendering keys aswell!
