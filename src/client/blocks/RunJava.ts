// Testhilfe: Java-Programm mit dem Compiler der IDE übersetzen und ausführen (nur für Tests)
import { Interpreter } from "../../compiler/common/interpreter/Interpreter";
import { JavaCompiler } from "../../compiler/java/JavaCompiler";
import { JavaLibraryManager } from "../../compiler/java/runtime/JavaLibraryManager";
import { CompilerFile } from "../../compiler/common/module/CompilerFile";
import { StoreOutputPrintManager } from "../../test/StoreOutputPrintManager";

export async function runJava(code: string, libraries: string[] = []): Promise<{ errors: string[]; output: string }> {
    const file = new CompilerFile();
    file.setText(code);
    const compiler = new JavaCompiler();
    const libManager = new JavaLibraryManager();
    libManager.addLibraries(...libraries);
    libManager.addLibrariesToCompiler(compiler);
    compiler.setFiles([<any>file]);
    const executable = await compiler.compileIfDirty();
    if (!executable) return { errors: ["kein Ergebnis"], output: "" };
    const errors = executable.getAllErrors().filter((e) => e.level == "error")
        .map((e) => `Zeile ${e.range.startLineNumber}: ${e.message}`);
    if (errors.length) return { errors, output: "" };
    const printManager = new StoreOutputPrintManager();
    const interpreter = new Interpreter(printManager);
    interpreter.setExecutable(executable);
    interpreter.runMainProgramSynchronously();
    return { errors: [], output: printManager.output };
}
