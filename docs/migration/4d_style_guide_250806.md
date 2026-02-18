# 4D Coding Style Guide

*Version: 1.0*  
*Last Updated: 8/6/2025*

## Table of Contents
- [General Principles](#general-principles)
- [Variable Naming Conventions](#variable-naming-conventions)
- [Method Naming Conventions](#method-naming-conventions)
- [Code Structure and Organization](#code-structure-and-organization)
- [Commenting Standards](#commenting-standards)
- [Spacing and Indentation](#spacing-and-indentation)
- [Error Handling](#error-handling)
- [Database Design Standards](#database-design-standards)
- [Form and Object Naming](#form-and-object-naming)
- [Best Practices](#best-practices)
- [Code Review Checklist](#code-review-checklist)

---

## General Principles

### Code Readability
- [Add your principles for writing readable code]
- [Example: Code should be self-documenting wherever possible]

### Consistency
- [Define your consistency standards]
- [Example: Use the same naming pattern throughout the project]

### Performance Considerations
- [Add performance-related coding guidelines]

---

## Variable Naming Conventions

### General Philosophy
All local, process, and interprocess variables are given verbose names to describe their function. For example, an index in a For loop is not named a generic `$i` or `$index` but something more meaningful, such as `$vl_CueIndex`. This is done so that if you are looking further down within the block of code, you know exactly what that variable is holding.

### Naming Pattern
All variable names should consist of the following pattern:
```
{variable prefix}{variable type}{value type}_{camelcaseDescriptiveName}
```

### Variable Prefixes
- **$** = local
- **<>** = interprocess  
- **(no prefix)** = process

### Variable Types
- **cs** = class
- **v** = scalar variable
- **a** = array
- **p** = pointer
- **e** = entity
- **es** = entity selection

### Value Types
*(excludes classes, entities, and entity selections)*
- **b** = Boolean
- **c** = Collection
- **d** = Date
- **h** = Time
- **l** = Integer
- **j** = Object
- **r** = Real
- **s** = String, followed by a number designating the size of the string, such as s255
- **t** = Text
- **u** = Picture
- **v** = Variant
- **x** = Blob

### Examples
```4d
// Local variables
$vl_CueIndex:=Longint                    // Loop index for cues
$vt_UserName:=Text                       // User's name
$vb_IsValid:=Boolean                     // Validation flag
$vc_MenuItems:=Collection                // Collection of menu items
$e_CustomerData:=Entity                  // Customer entity
$es_FilteredRecords:=Entity selection    // Filtered entity selection

// Process variables
vl_GlobalCounter:=Longint               // Global counter
vt_ApplicationStatus:=Text              // Application status

// Interprocess variables
<>vt_DatabasePath:=Text                 // Shared database path
<>vl_MaxUsers:=Longint                  // Maximum user count
```

### Parameter Variables
- **$1, $2, $3...** = Input parameters (use descriptive comments)
- **$0** = Return value

### Constants
- **Format:** All caps with underscores
- **Examples:**
  ```4d
  // Add examples here
  ```

### Class Properties
Class properties do not follow the standard variable naming pattern. They use a simplified naming convention:
- **Format:** camelCase starting with lowercase letter
- **No prefixes, type indicators, or underscores**
- **Acronyms:** All letters in acronyms are uppercase

**Examples:**
```4d
// Class properties
userName                    // Simple property
isValid                     // Boolean property
customerUTI                 // Property with acronym (UTI = Uniform Type Identifier)
maxHTTPConnections          // Property with HTTP acronym
dataSourceURL               // Property with URL acronym
```

---

## Method Naming Conventions

### Public Methods
- **Format:** [Define your format]
- **Examples:**
  ```4d
  // Add examples here
  UserManager_CreateUser
  Database_BackupData
  ```

### Private Methods
- **Format:** [Define your format]
- **Examples:**
  ```4d
  // Add examples here
  _validateUserInput
  _processInternalData
  ```

### Event Methods
- **Format:** [Define your format]
- **Examples:**
  ```4d
  // Add examples here
  ```

---

## Code Structure and Organization

### Method Organization
- [Define how methods should be structured]
- [Example: Parameter validation first, main logic, cleanup]

### File Organization
- [Define folder/group structure for methods]
- [Define naming conventions for method groups]

### Code Blocks
- [Define standards for organizing code within methods]

---

## Commenting Standards

### Function Comments
Put the comment that describes what a function does inside the function as the first line.

**Example:**
```4d
Function calculateTotalPrice()->$vr_Total : Real
    // Calculate the total price including tax and discounts
    
    var $vr_BasePrice : Real
    var $vr_Tax : Real
    // Function implementation here
```

### Header Comments
```4d
// Add your standard method header format here
// Method: [Method Name]
// Purpose: [Description]
// Parameters: [List parameters]
// Returns: [Return value description]
// Author: [Author name]
// Created: [Date]
// Modified: [Date and reason]
```

### Inline Comments
- **When to comment:** [Define when inline comments are needed]
- **Format:** [Define comment style]
- **Examples:**
  ```4d
  // Add examples of good inline comments
  ```

### TODO Comments
- **Format:** [Define format for TODO comments]
- **Examples:**
  ```4d
  // TODO: Add input validation here
  // FIXME: Handle edge case for empty arrays
  ```

---

## Spacing and Indentation

### Line Spacing
- **Between logical blocks:** One blank line for better readability
- **Between class functions:** Two blank lines

### Indentation
The 4D method editor automatically handles indentation and spacing within lines, so no manual formatting is required when working in the 4D environment. Code will be automatically reformatted when pasted into the 4D method editor.

**Note for AI assistance:** When Claude or other AI assistants provide 4D code examples, proper indentation should be included for readability, even though it will be reformatted by the 4D editor.

### Line Length
- **Maximum characters:** [Define max line length]
- **Line wrapping:** [How to wrap long lines]

### Examples
```4d
// Add examples of properly formatted code here
If (condition1) & (condition2)
    // Properly indented code
    $result:=SomeMethod($param1; $param2)
End if
```

---

## Error Handling

### Error Checking Patterns
All code should use the process variable `cs_ERR` when checking or setting errors.

### Error Checking Properties
- **`cs_ERR.noError`** - Returns True if no error has occurred (computed property, no parentheses)
- **`cs_ERR.error`** - Returns True if an error has occurred (computed property, no parentheses)

### Setting Errors
Use **`cs_ERR.setError()`** to set an error. Pass a single object with the following properties:
- **`name`** (required Text) - An error name. Use "errGEN_TO_BE_DETERMINED" as the default
- **`messageStrings`** (optional Collection of Texts) - Put the error message in the first and only string in this collection

**Example:**
```4d
cs_ERR.setError({name: "errGEN_TO_BE_DETERMINED"; messageStrings: ["Invalid file header"]})
```

### Error Flow Control
In general, logical code blocks should be skipped if an earlier error occurs within a function. You can bracket logical code blocks using `If (cs_ERR.noError)...End if`.

If you are bracketing a logical code block that is already bracketed by another condition, combine the conditions on the same line as the call to `cs_ERR.noError`.

**Return Values:** You don't need to return a "success" value for functions that might post an error but have no return value. The error will get picked up by the caller since it is stored in a process variable.

**Early Returns:** If you are calling "return" after setting an error, you don't need to call `cs_ERR.noError` for subsequent code blocks since the function will exit.

**Error Propagation:** After calling a function and checking to see if an error was posted, do not create a new object to report the error. Instead, assume some caller further up the stack will handle the error that is stored in `cs_ERR`.

**Examples:**
```4d
// Early return after error - no need for cs_ERR.noError checks afterward
If ($vt_Input="")
    cs_ERR.setError({name: "errGEN_TO_BE_DETERMINED"; messageStrings: ["Input cannot be empty"]})
    return
End if

// No need to check cs_ERR.noError here since function would have returned above
$vt_ProcessedData:=ProcessInput($vt_Input)

// ✅ Correct - Let error propagate up the stack
CallSomeFunction($vt_Data)
If (cs_ERR.error)
    return  // Don't create new error, let existing error propagate
End if

// ❌ Incorrect - Don't create new error objects
CallSomeFunction($vt_Data)
If (cs_ERR.error)
    cs_ERR.setError({name: "errGEN_ANOTHER_ERROR"; messageStrings: ["Function failed"]})
    return
End if
```

### Loop Error Handling
In "for", "while", and "repeat" loops, generally check `cs_ERR` for errors if there is a possibility that there may be an error within the loop.

**All loop types:** Use the keyword "break" to exit any loop when an error occurs.

**Examples:**
```4d
// Basic error checking
If (cs_ERR.noError)
    // Logical code block
    $vt_Result:=ProcessData($vt_Input)
End if

// Combined conditions
If ($vb_FileExists) & (cs_ERR.noError)
    // Process file only if it exists AND no error occurred
    $vt_Content:=ReadFileContent($vt_FilePath)
End if

// For loop with break on error
For ($vl_Index; 1; $vl_MaxRecords)
    $e_Record:=ProcessRecord($vl_Index)
    If (cs_ERR.error)
        break
    End if
    // Additional processing
End for

// While loop with break on error
While ($vb_HasMoreData)
    $vt_Data:=GetNextDataChunk()
    If (cs_ERR.error)
        break
    End if
    // Process data that might cause errors
End while

// Repeat loop with break on error
Repeat
    $vt_Data:=GetNextDataChunk()
    If (cs_ERR.error)
        break
    End if
    // Process data
Until ($vb_Finished)
```

### Error Messages
- **Format:** [Define error message format]
- **Logging:** [Define error logging standards]

---

## Database Design Standards

### Table Naming
- **Format:** [Define table naming convention]
- **Examples:** [Add examples]

### Field Naming
- **Format:** [Define field naming convention]
- **Examples:** [Add examples]

### Relationship Naming
- **Format:** [Define relationship naming convention]

---

## Form and Object Naming

### Form Names
- **Format:** [Define form naming convention]
- **Examples:** [Add examples]

### Object Names
- **Variables:** [Define form object variable naming]
- **Buttons:** [Define button naming]
- **Lists:** [Define list naming]
- **Examples:**
  ```4d
  // Add examples here
  ```

---

## Best Practices

### Variable Declarations
In methods and functions, do not use C_ compiler directives. Always use "var" declarations.

**Exception:** Certain data types have no "var" equivalent, namely ARRAY declarators such as ARRAY LONGINT. In those cases, use the old style compiler declarator.

**Formatting:** When declaring variables in a method or function, put each variable on its own line.

**Location:** All local variable declarations should appear at the top of a function, not in the body of the function.

**Examples:**
```4d
// ✅ Correct - Use var declarations for standard types, one per line, at top of function
var $vt_UserName : Text
var $vl_Counter : Integer
var $e_Customer : cs.Customer

// ✅ Correct - Use array declarators when var is not available
ARRAY LONGINT($al_Numbers; 0)
ARRAY TEXT($at_Names; 0)

// ❌ Incorrect - Do not use C_ directives when var is available
C_TEXT($vt_UserName)
C_LONGINT($vl_Counter)

// ❌ Incorrect - Do not put multiple declarations on one line
var $vt_UserName : Text; $vl_Counter : Integer
```

### Class Function Return Values
When returning a value from a class function, always store the result in a variable and declare the variable in the function declaration.

**Example:**
```4d
Function getRemainingBytes()->$vl_NumBytes : Integer
    // Function logic here
    $vl_NumBytes:=This.totalBytes-This.usedBytes
```

### Assignment Operators
Use compound assignment operators (+=, -=, *=, /=) whenever possible instead of the full assignment form.

**Examples:**
```4d
// ✅ Correct - Use compound assignment operators
$vl_Counter+=1
$vr_Total-=$vr_Discount
$vl_Value*=2

// ❌ Incorrect - Avoid redundant full assignment
$vl_Counter:=$vl_Counter+1
$vr_Total:=$vr_Total-$vr_Discount
$vl_Value:=$vl_Value*2
```

### Object Parameter Defaults
When passing an object to a function as a parameter, if there are optional properties that are missing, use ternary operators to fill the optional properties with default values at the beginning of the function.

Use the evaluation rules that apply to Null and Undefined values in 4D v20 to simplify statements.

**Examples:**
```4d
// Simplified using 4D v20 Null/Undefined evaluation rules
$vl_Increment:=$vl_Increment || 0
$vt_DefaultName:=$vt_DefaultName || "Untitled"
$vb_IsEnabled:=$vb_IsEnabled || True

// Traditional ternary approach (still valid but more verbose)
$vl_Increment:=($vl_Increment#Null) ? $vl_Increment : 0
$vt_DefaultName:=($vt_DefaultName#Null) ? $vt_DefaultName : "Untitled"
$vb_IsEnabled:=($vb_IsEnabled#Null) ? $vb_IsEnabled : True
```

### BLOB Operations
BLOB read commands such as `BLOB to integer()` require a local variable to be passed for the offset, since the variable is changed during the call.

**Example:**
```4d
var $vl_Offset : Integer
$vl_Offset:=0
$vl_Value:=BLOB to integer($x_Data; $vl_Offset)
// $vl_Offset is now updated to the next position
```

### Object Definition
When defining objects, favor using the `{}` operator over `New object()`.

**Simple objects (1-2 properties):**
```4d
$vj_Object:={property1: $vv_Value1; property2: $vv_Value2}
```

**Complex objects (more than 2 properties):**
```4d
$vj_Object:={
    property1: $vv_Value1;
    property2: $vv_Value2;
    property3: $vv_Value3
}
```

**Objects with lengthy expressions:**
```4d
$vj_Object:=New object()
$vj_Object.property1:=<lengthy expression>
$vj_Object.property2:=<lengthy expression>
```

### Performance
- [Add performance best practices]
- [Example: Use appropriate data types]
- [Example: Minimize database calls in loops]

### Security
- [Add security best practices]  
- [Example: Input validation standards]
- [Example: SQL injection prevention]

### Maintenance
- [Add maintainability best practices]
- [Example: Avoid hardcoded values]
- [Example: Use meaningful variable names]

---

## Code Review Checklist

Use this checklist when reviewing 4D code:

### Naming and Structure
- [ ] Variable names follow established conventions
- [ ] Method names are descriptive and follow conventions
- [ ] Code is properly organized and structured

### Documentation
- [ ] Methods have proper header comments
- [ ] Complex logic is commented
- [ ] TODO items are properly marked

### Error Handling
- [ ] Appropriate error handling is implemented
- [ ] Error messages are clear and helpful

### Performance
- [ ] Code follows performance best practices
- [ ] No unnecessary database calls in loops
- [ ] Appropriate data types are used

### Security
- [ ] Input validation is implemented where needed
- [ ] No SQL injection vulnerabilities

### Style
- [ ] Consistent indentation and spacing
- [ ] Code follows formatting standards
- [ ] No overly long lines or methods

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0     | [Date] | Initial creation | [Author] |

---

*This style guide is a living document. Please update it as our coding standards evolve.*