/**
 * Build-time patch that lets OpenCV.js run under a strict Content-Security-Policy.
 *
 * The bundled OpenCV.js (Emscripten embind) creates its JavaScript bindings with
 * `new Function(...)`, which needs CSP `'unsafe-eval'`. This patch replaces the four code
 * generators with equivalent closures, so the page only needs `'wasm-unsafe-eval'` to
 * compile the WebAssembly module. If a future OpenCV.js release changes these functions,
 * the patch fails loudly instead of silently shipping a build that the CSP would block.
 */

const replacements: Record<string, string> = {
  createNamedFunction:
    'function createNamedFunction(name,body){name=makeLegalFunctionName(name);' +
    'var f=function(){"use strict";return body.apply(this,arguments)};' +
    'try{Object.defineProperty(f,"name",{value:name})}catch(e){}return f}',
  makeDynCaller:
    'function makeDynCaller(dynCall){return function(){var a=[rawFunction];' +
    'for(var i=0;i<arguments.length;++i)a.push(arguments[i]);return dynCall.apply(null,a)}}',
  craftInvokerFunction:
    'function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){' +
    'var argCount=argTypes.length;' +
    'if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and \'this\' types!")}' +
    'var isClassMethodFunc=argTypes[1]!==null&&classType!==null;var needsDestructorStack=false;' +
    'for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}' +
    'var returns=argTypes[0].name!=="void";var expected=argCount-2;' +
    'var invoker=function(){' +
    'if(arguments.length!==expected){throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+expected+" args!")}' +
    'var destructors=needsDestructorStack?[]:null;var wired=[cppTargetFunc];var thisWired;' +
    'if(isClassMethodFunc){thisWired=argTypes[1].toWireType(destructors,this);wired.push(thisWired)}' +
    'var argsWired=new Array(expected);' +
    'for(var i=0;i<expected;++i){argsWired[i]=argTypes[i+2].toWireType(destructors,arguments[i]);wired.push(argsWired[i])}' +
    'var rv=cppInvokerFunc.apply(null,wired);' +
    'if(needsDestructorStack){runDestructors(destructors)}else{' +
    'for(var j=isClassMethodFunc?1:2;j<argTypes.length;++j){var param=j===1?thisWired:argsWired[j-2];' +
    'if(argTypes[j].destructorFunction!==null){argTypes[j].destructorFunction(param)}}}' +
    'if(returns){return argTypes[0].fromWireType(rv)}};' +
    'return createNamedFunction(humanName,invoker)}',
  __emval_get_method_caller:
    'function __emval_get_method_caller(argCount,argTypes){' +
    'var types=__emval_lookupTypes(argCount,argTypes);var retType=types[0];' +
    'var invokerFunction=function(handle,name,destructors,args){var a=new Array(argCount-1);var offset=0;' +
    'for(var i=0;i<argCount-1;++i){a[i]=types[1+i].readValueFromPointer(args+offset);offset+=types[i+1]["argPackAdvance"]}' +
    'var rv=handle[name].apply(handle,a);' +
    'for(var k=0;k<argCount-1;++k){if(types[k+1]["deleteObject"]){types[k+1].deleteObject(a[k])}}' +
    'if(!retType.isVoid){return retType.toWireType(destructors,rv)}};' +
    'return __emval_addMethodCaller(invokerFunction)}',
};

/** Returns the end index (exclusive) of the function body starting at `start`. */
function functionEnd(source: string, start: number) {
  let depth = 0;
  let quote = '';
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return i + 1;
  }
  throw new Error('Unbalanced function body');
}

export function patchOpenCv(source: string): string {
  let patched = source;
  for (const [name, replacement] of Object.entries(replacements)) {
    const marker = `function ${name}(`;
    const start = patched.indexOf(marker);
    if (start < 0 || patched.indexOf(marker, start + 1) >= 0)
      throw new Error(`OpenCV.js CSP patch: expected exactly one ${name}()`);
    patched = patched.slice(0, start) + replacement + patched.slice(functionEnd(patched, start));
  }
  if (/new Function|new_\(Function/.test(patched))
    throw new Error('OpenCV.js CSP patch: dynamic code generation is still present');
  return patched;
}

export const isOpenCvFile = (id: string) =>
  // Only the real file, not Rollup's virtual `\0...?commonjs-*` wrappers around it.
  !id.startsWith('\0') && /[\\/]@techstark[\\/]opencv-js[\\/]dist[\\/]opencv\.js$/.test(id);
