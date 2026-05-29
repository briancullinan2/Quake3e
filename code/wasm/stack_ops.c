// stack_ops.c
// Direct stack manipulation using inline assembly to bypass missing builtins

#ifdef __wasm64__
typedef unsigned long long ptr_t;
#else
typedef unsigned int ptr_t;
#endif

void* stackSave() {
    void* sp;
    __asm__(
        "global.get __stack_pointer"
        : "=r"(sp)
    );
    return sp;
}

void stackRestore(void* ptr) {
    __asm__(
        "global.set __stack_pointer, %0"
        :
        : "r"(ptr)
    );
}

void* stackAlloc(ptr_t size) {
    ptr_t sp;
    // Get current SP
    __asm__(
        "global.get __stack_pointer"
        : "=r"(sp)
    );

    // Subtract and align to 16 bytes
    ptr_t new_sp = (sp - size) & ~0xF;

    // Set new SP
    __asm__(
        "global.set __stack_pointer, %0"
        :
        : "r"(new_sp)
    );
    
    return (void*)new_sp;
}

void* emscripten_stack_get_current() {
    return stackSave();
}

