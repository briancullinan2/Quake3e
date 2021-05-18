
#ifndef __WRAPPER_H
#define __WRAPPER_H

#ifdef __cplusplus

#include "./Core/Core.h"
#include "./Core/FileInterface.h"
#include "./Core/RenderInterface.h"
#include "./Core/SystemInterface.h"
#include "./Core/Context.h"

extern "C" {

namespace Rml {
  //typedef Context* qhandle_t;
  typedef bool qboolean;
  typedef int qhandle_t;
  typedef Vector2f vec2_t;
  typedef int fileHandle_t;
#endif
;

  typedef struct {
    void (*__new)( void );

    fileHandle_t (*Open)(const char *path);
    /// Closes a previously opened file.
    /// @param file The file handle previously opened through Open().
    void (*Close)(fileHandle_t file);

    /// Reads data from a previously opened file.
    /// @param buffer The buffer to be read into.
    /// @param size The number of bytes to read into the buffer.
    /// @param file The handle of the file.
    /// @return The total number of bytes read into the buffer.
    size_t (*Read)(void* buffer, size_t size, fileHandle_t file);
    /// Seeks to a point in a previously opened file.
    /// @param file The handle of the file to seek.
    /// @param offset The number of bytes to seek.
    /// @param origin One of either SEEK_SET (seek from the beginning of the file), SEEK_END (seek from the end of the file) or SEEK_CUR (seek from the current file position).
    /// @return True if the operation completed successfully, false otherwise.
    qboolean (*Seek)(fileHandle_t file, long offset, int origin);
    /// Returns the current position of the file pointer.
    /// @param file The handle of the file to be queried.
    /// @return The number of bytes from the origin of the file.
    int (*Tell)(fileHandle_t file);

    /// Returns the length of the file.
    /// The default implementation uses Seek & Tell.
    /// @param file The handle of the file to be queried.
    /// @return The length of the file in bytes.
    int (*Length)(fileHandle_t file);

    /// Load and return a file.
    /// @param path The path to the file to load.
    /// @param out_data The string contents of the file.
    /// @return True on success.
    int (*LoadFile)(const char *path, char **out_data);
  } RmlFileInterface;


  typedef struct {
    //RenderInterface();
  	//~RenderInterface();
    void (*__new)( void );

  	/// Called by RmlUi when it wants to render geometry that the application does not wish to optimise. Note that
  	/// RmlUi renders everything as triangles.
  	/// @param[in] vertices The geometry's vertex data.
  	/// @param[in] num_vertices The number of vertices passed to the function.
  	/// @param[in] indices The geometry's index data.
  	/// @param[in] num_indices The number of indices passed to the function. This will always be a multiple of three.
  	/// @param[in] texture The texture to be applied to the geometry. This may be nullptr, in which case the geometry is untextured.
  	/// @param[in] translation The translation to apply to the geometry.
  	void (*RenderGeometry)(byte *vertices, int num_vertices, int* indices, int num_indices, qhandle_t texture, const vec2_t *translation);

  	/// Called by RmlUi when it wants to compile geometry it believes will be static for the forseeable future.
  	/// If supported, this should return a handle to an optimised, application-specific version of the data. If
  	/// not, do not override the function or return zero; the simpler RenderGeometry() will be called instead.
  	/// @param[in] vertices The geometry's vertex data.
  	/// @param[in] num_vertices The number of vertices passed to the function.
  	/// @param[in] indices The geometry's index data.
  	/// @param[in] num_indices The number of indices passed to the function. This will always be a multiple of three.
  	/// @param[in] texture The texture to be applied to the geometry. This may be nullptr, in which case the geometry is untextured.
  	/// @return The application-specific compiled geometry. Compiled geometry will be stored and rendered using RenderCompiledGeometry() in future calls, and released with ReleaseCompiledGeometry() when it is no longer needed.
  	qhandle_t (*CompileGeometry)(byte *vertices, int num_vertices, int* indices, int num_indices, qhandle_t texture);
  	/// Called by RmlUi when it wants to render application-compiled geometry.
  	/// @param[in] geometry The application-specific compiled geometry to render.
  	/// @param[in] translation The translation to apply to the geometry.
  	void (*RenderCompiledGeometry)(qhandle_t geometry, const vec2_t *translation);
  	/// Called by RmlUi when it wants to release application-compiled geometry.
  	/// @param[in] geometry The application-specific compiled geometry to release.
  	void (*ReleaseCompiledGeometry)(qhandle_t geometry);

  	/// Called by RmlUi when it wants to enable or disable scissoring to clip content.
  	/// @param[in] enable True if scissoring is to enabled, false if it is to be disabled.
  	void (*EnableScissorRegion)(qboolean enable);
  	/// Called by RmlUi when it wants to change the scissor region.
  	/// @param[in] x The left-most pixel to be rendered. All pixels to the left of this should be clipped.
  	/// @param[in] y The top-most pixel to be rendered. All pixels to the top of this should be clipped.
  	/// @param[in] width The width of the scissored region. All pixels to the right of (x + width) should be clipped.
  	/// @param[in] height The height of the scissored region. All pixels to below (y + height) should be clipped.
  	void (*SetScissorRegion)(int x, int y, int width, int height);

  	/// Called by RmlUi when a texture is required by the library.
  	/// @param[out] texture_handle The handle to write the texture handle for the loaded texture to.
  	/// @param[out] texture_dimensions The variable to write the dimensions of the loaded texture.
  	/// @param[in] source The application-defined image source, joined with the path of the referencing document.
  	/// @return True if the load attempt succeeded and the handle and dimensions are valid, false if not.
  	qhandle_t (*LoadTexture)(int texture_dimensions[2], const char *source);
  	/// Called by RmlUi when a texture is required to be built from an internally-generated sequence of pixels.
  	/// @param[out] texture_handle The handle to write the texture handle for the generated texture to.
  	/// @param[in] source The raw 8-bit texture data. Each pixel is made up of four 8-bit values, indicating red, green, blue and alpha in that order.
  	/// @param[in] source_dimensions The dimensions, in pixels, of the source data.
  	/// @return True if the texture generation succeeded and the handle is valid, false if not.
  	qhandle_t (*GenerateTexture)(const byte* source, const int *source_dimensions);
  	/// Called by RmlUi when a loaded texture is no longer required.
  	/// @param texture The texture handle to release.
  	void (*ReleaseTexture)(qhandle_t texture);

  	/// Called by RmlUi when it wants the renderer to use a new transform matrix.
  	/// This will only be called if 'transform' properties are encountered. If no transform applies to the current element, nullptr
  	/// is submitted. Then it expects the renderer to use an identity matrix or otherwise omit the multiplication with the transform.
  	/// @param[in] transform The new transform to apply, or nullptr if no transform applies to the current element.
  	void (*SetTransform)(const byte *transform);

  	/// Get the context currently being rendered. This is only valid during RenderGeometry,
  	/// CompileGeometry, RenderCompiledGeometry, EnableScissorRegion and SetScissorRegion.
  	const void (*GetContext)( void );
  } RmlRenderInterface;

  typedef struct {
    /*
    SystemInterface();
    ~SystemInterface();
    */
    void (*__new)( void );

    /// Get the number of seconds elapsed since the start of the application.
    /// @return Elapsed time, in seconds.
    double (*GetElapsedTime)( void );

    /// Translate the input string into the translated string.
    /// @param[out] translated Translated string ready for display.
    /// @param[in] input String as received from XML.
    /// @return Number of translations that occured.
    int (*TranslateString)(char *translated, const char *input);

    /// Joins the path of an RML or RCSS file with the path of a resource specified within the file.
    /// @param[out] translated_path The joined path.
    /// @param[in] document_path The path of the source document (including the file name).
    /// @param[in] path The path of the resource specified in the document.
    void (*JoinPath)(char *translated_path, const char *document_path, const char *path);

    /// Log the specified message.
    /// @param[in] type Type of log message, ERROR, WARNING, etc.
    /// @param[in] message Message to log.
    /// @return True to continue execution, false to break into the debugger.
    qboolean (*LogMessage)(int type, const char *message);

    /// Set mouse cursor.
    /// @param[in] cursor_name Cursor name to activate.
    void (*SetMouseCursor)(const char *cursor_name);

    /// Set clipboard text.
    /// @param[in] text Text to apply to clipboard.
    void (*SetClipboardText)(const char *text);

    /// Get clipboard text.
    /// @param[out] text Retrieved text from clipboard.
    void (*GetClipboardText)(char *text);

    /// Activate keyboard (for touchscreen devices)
    void (*ActivateKeyboard)( void );
    
    /// Deactivate keyboard (for touchscreen devices)
    void (*DeactivateKeyboard)( void );

  } RmlSystemInterface;

#ifdef __cplusplus

  class StructuredFileInterface : public Rml::FileInterface 
  {
    public:
      StructuredFileInterface(RmlFileInterface *file_interface);
      virtual ~StructuredFileInterface();

      FileHandle Open(const Rml::String& path) override;
      void Close(FileHandle file) override;
      size_t Read(void* buffer, size_t size, FileHandle file) override;
      bool Seek(FileHandle file, long offset, int origin) override;
      size_t Tell(FileHandle file) override;
      size_t Length(FileHandle file) override;
      bool LoadFile(const String& path, String& out_data) override;
    private:
      RmlFileInterface *files;
  };
  class StructuredSystemInterface : public Rml::SystemInterface 
  {
    public:
      StructuredSystemInterface(RmlSystemInterface *system);
      bool LogMessage(Log::Type type, const String& message) override;
      double GetElapsedTime() override;
    private:
      RmlSystemInterface *system;
  };
  class StructuredRenderInterface : public Rml::RenderInterface 
  {
    public:
      StructuredRenderInterface(RmlRenderInterface *renderer);
      void RenderGeometry(Vertex* vertices, int num_vertices, int* indices, int num_indices, TextureHandle texture, const Vector2f& translation) override;
      void EnableScissorRegion(bool enable) override;
      void SetScissorRegion(int x, int y, int width, int height) override;
      bool LoadTexture(TextureHandle& texture_handle, Vector2i& texture_dimensions, const String& source) override;
    private:
      RmlRenderInterface *renderer;
  };
#endif // __cplusplus

void Rml_SetSystemInterface(RmlSystemInterface *system);

qboolean Rml_Initialize( void );

void Rml_SetRenderInterface(RmlRenderInterface *renderer);

void Rml_SetFileInterface(RmlFileInterface *file_interface);

qhandle_t Rml_CreateContext( const char *name, int width, int height );

qhandle_t Rml_LoadDocument(qhandle_t ctx, const char *document_path);

void Rml_ShowDocument(qhandle_t document);

void Rml_Shutdown( void );

void Rml_ContextRender( qhandle_t ctx );

void Rml_ContextUpdate( qhandle_t ctx );

#ifdef __cplusplus
}

}
#endif

#endif
