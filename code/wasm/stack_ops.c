// stack_ops.c
// Replace your .S file with this to fix the "null function" crash

#ifdef __wasm64__
typedef unsigned long long ptr_t;
#else
typedef unsigned int ptr_t;
#endif

// These builtins map directly to the global.get/set __stack_pointer instructions
extern void* __builtin_wasm_stack_pointer(void);
extern void __builtin_wasm_set_stack_pointer(void*);

void* stackSave() {
    return __builtin_wasm_stack_pointer();
}

void stackRestore(void* ptr) {
    __builtin_wasm_set_stack_pointer(ptr);
}

void* stackAlloc(ptr_t size) {
    ptr_t sp = (ptr_t)__builtin_wasm_stack_pointer();
    ptr_t new_sp = (sp - size) & ~0xF; // Subtract and align to 16 bytes
    __builtin_wasm_set_stack_pointer((void*)new_sp);
    return (void*)new_sp;
}

void* emscripten_stack_get_current() {
    return __builtin_wasm_stack_pointer();
}
