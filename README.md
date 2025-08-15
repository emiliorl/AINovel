# AI Novel Translator

A React-based web application for translating Chinese novels using AI services. This is a serverless application that runs entirely in the browser.

## Features

- **Multiple AI Translation Providers**: Support for OpenAI, HuggingFace, and LibreTranslate
- **Novel Management**: Create and manage multiple novels with chapters
- **Character Glossary**: Maintain consistent character name translations
- **Translation Notes**: AI-generated explanatory notes for cultural context
- **Supabase Integration**: Optional database backend for saving translations
- **Responsive Design**: Works on desktop and mobile devices

## Setup

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

1. Build the application:
   ```bash
   npm run build
   ```

2. The built files will be in the `build/` directory.

## Deployment

### Netlify

This project is configured for Netlify deployment:

1. Connect your repository to Netlify
2. The build settings are already configured in `netlify.toml`
3. Netlify will automatically run `npm run build` and serve from the `build/` directory

### Manual Deployment

1. Run `npm run build`
2. Upload the contents of the `build/` directory to your web server

## Configuration

### Supabase (Optional)

To enable saving translations and user authentication:

1. Create a Supabase project
2. Run the SQL schema provided in the app comments
3. Add your Supabase URL and anon key in the app settings

### AI Providers

- **OpenAI**: Add your API key in settings for GPT-4 translations
- **HuggingFace**: Add your API key for NLLB model translations
- **LibreTranslate**: Free demo available, or configure your own endpoint

## Project Structure

```
src/
├── App.js          # Main application component
├── index.js        # Application entry point
├── index.css       # Global styles with Tailwind CSS
public/
├── index.html      # HTML template
```

## Technologies Used

- React 18
- Tailwind CSS
- Supabase (optional)
- Lucide React Icons
- Create React App

## License

This project is open source and available under the MIT License.
